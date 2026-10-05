// Why Unix: the pretend server and the small shell its page runs on. The server holds a few days of
// web logs, some settings, live /proc files and a package manager with a handful of packages, so the
// student can join tools with pipes, edit a setting with >>, save a script and install a tool.
// Nothing here touches the page, so the tests can run it too.

export function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- the logs ---------- */
export const ATTACKER = '203.0.113.42';
export const VISITORS = [...Array(26)].map((_, i) => i < 14 ? `10.0.${1 + (i * 7) % 9}.${20 + i * 11}` : `192.0.2.${10 + i * 9}`);
const PAGES = [['GET', '/', 200, 6], ['GET', '/news', 200, 4], ['GET', '/datasets', 200, 4], ['GET', '/about', 200, 2], ['GET', '/search?q=rainfall', 200, 3],
  ['GET', '/images/logo.png', 200, 6], ['GET', '/login', 200, 2], ['GET', '/old-page', 404, 1], ['GET', '/favicon.ico', 404, 2], ['GET', '/reports/2025.pdf', 404, 1]];
export const BAG = PAGES.flatMap(page => Array(page[3]).fill(page));
export const two = n => String(n | 0).padStart(2, '0');
export const logLine = (ip, day, t, method, path, status, size) => `${ip} - - [${day}/Oct/2026:${two(t / 3600)}:${two(t / 60 % 60)}:${two(t % 60)} +1000] "${method} ${path} HTTP/1.1" ${status} ${size}`;
// A day of ordinary traffic, where each regular visitor mistypes their password up to three times,
// plus whoever is attacking the login page that day, all within the hour they start.
function day(seed, date, attackers) {
  const r = rng(seed), events = [], pick = list => list[Math.floor(r() * list.length)], second = () => Math.floor(r() * 86400);
  for (let i = 0; i < 1150; i++) { const [method, path, status] = pick(BAG); events.push([second(), pick(VISITORS), method, path, status]); }
  for (const ip of VISITORS) {
    const typos = Math.floor(r() * 4);
    for (let k = 0; k < typos; k++) events.push([second(), ip, 'POST', '/login', 401]);
    events.push([second(), ip, 'POST', '/login', 200]);
  }
  for (const a of attackers) for (let k = 0; k < a.n; k++) events.push([a.at * 3600 + Math.floor(r() * 3600), a.ip, 'POST', '/login', 401]);
  events.sort((a, b) => a[0] - b[0]);
  return events.map(([t, ip, method, path, status]) => logLine(ip, date, t, method, path, status, status === 401 ? 512 : 300 + Math.floor(r() * 9000)));
}

/* ---------- the file system ---------- */
export const HOME = '/home/you';
export const BLOCKLIST = '/etc/nginx/blocklist.conf';
export const SCRIPT = `${HOME}/bin/who-failed`;
const started = Date.now();
const since = () => (Date.now() - started) / 1000;
// A value is a file's lines, or a function that makes them each time it's read, as /proc does.
export const FS = {
  [`${HOME}/access.log`]: day(7, '05', [{ ip: ATTACKER, n: 183, at: 1 }, { ip: '198.51.100.7', n: 27, at: 3 }, { ip: '10.0.4.17', n: 9, at: 14 }]),
  [`${HOME}/mon.log`]: day(11, '06', [{ ip: '192.0.2.200', n: 61, at: 2 }, { ip: '198.51.100.7', n: 19, at: 22 }, { ip: '10.0.4.17', n: 5, at: 9 }]),
  [`${HOME}/tue.log`]: day(13, '07', []),
  [`${HOME}/wed.log`]: day(17, '08', [{ ip: '203.0.113.99', n: 240, at: 0 }, { ip: '203.0.113.7', n: 88, at: 4 }]),
  '/etc/hostname': ['ceres'],
  '/etc/timezone': ['Australia/Brisbane'],
  '/etc/passwd': ['root:x:0:0:root:/root:/bin/bash', 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin', 'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin', 'you:x:1000:1000:You:/home/you:/bin/bash', 'sam:x:1001:1001:Sam:/home/sam:/bin/zsh'],
  [BLOCKLIST]: ['# Addresses the web server refuses.', 'deny 198.18.0.9;'],
  '/proc/uptime': () => [`${(86402.31 + since()).toFixed(2)} ${(172344.80 + since() * 1.9).toFixed(2)}`],
  '/proc/loadavg': () => { const r = Math.random; return [`${(2.6 + r()).toFixed(2)} ${(2.4 + r() * .5).toFixed(2)} ${(1 + r() * .2).toFixed(2)} ${1 + Math.floor(r() * 3)}/311 ${48211 + Math.floor(since() * 2.5)}`]; },
  '/proc/meminfo': () => { const free = 9120344 + Math.floor(Math.random() * 40000); return ['MemTotal:       16303428 kB', `MemFree:        ${String(free).padStart(9)} kB`, `MemAvailable:   ${String(free + 3722768).padStart(9)} kB`]; },
};
export const LOG = FS[`${HOME}/access.log`];
// The page listens here for writes, to light up a changed file.
export const watchers = new Set();
export const ctx = { cwd: HOME };

/* ---------- the package manager ---------- */
const PACKAGES = {
  whois: { version: '5.5.22', size: '51.7 kB', about: 'intelligent WHOIS client' },
  cowsay: { version: '3.03+dfsg2-8', size: '18.6 kB', about: 'configurable talking cow' },
  tree: { version: '2.1.1-2', size: '47.4 kB', about: 'displays an indented directory tree, in color' },
};
const UPGRADES = ['curl', 'firefox', 'libreoffice-core', 'openssl', 'python3', 'tzdata'];
export const installed = new Set();
let upgraded = false;
// Starts the server afresh, for the tests.
export function reset() { installed.clear(); upgraded = false; delete FS[SCRIPT]; ctx.cwd = HOME; FS[BLOCKLIST] = ['# Addresses the web server refuses.', 'deny 198.18.0.9;']; }

/* ---------- the shell ---------- */
function norm(path) { const out = []; for (const part of path.split('/')) { if (!part || part === '.') continue; if (part === '..') out.pop(); else out.push(part); } return '/' + out.join('/'); }
export function resolve(path) { if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1); return norm(path.startsWith('/') ? path : `${ctx.cwd}/${path}`); }
const isDir = path => { const prefix = path === '/' ? '/' : path + '/'; return Object.keys(FS).some(key => key.startsWith(prefix)); };
export function read(path) { const value = FS[resolve(path)]; return value === undefined ? null : typeof value === 'function' ? value() : value; }
const fail = message => ({ out: [], err: [message] });

function tokenize(source) {
  const tokens = []; let word = null, quote = null;
  const end = () => { if (word !== null) { tokens.push({ v: word }); word = null; } };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (c === quote) quote = null; else word += c; continue; }
    if (c === "'" || c === '"') { quote = c; word ??= ''; continue; }
    if (c === '\\' && i + 1 < source.length) { word = (word ?? '') + source[++i]; continue; }
    if (/\s/.test(c)) { end(); continue; }
    if (c === '|' || c === ';') { end(); tokens.push({ op: c }); continue; }
    if (c === '>') { end(); if (source[i + 1] === '>') { i++; tokens.push({ op: '>>' }); } else tokens.push({ op: '>' }); continue; }
    word = (word ?? '') + c;
  }
  if (quote) return { error: `sh: missing closing ${quote}` };
  end();
  return { tokens };
}
// Flags, with the letters in `valued` taking a value, as in -d' ' or -n 3. -3 is a count.
function options(args, valued = '') {
  const flags = {}, rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^-\d+$/.test(a)) { flags.num = a.slice(1); continue; }
    if (a.length > 1 && a[0] === '-' && a[1] !== '-') {
      for (let j = 1; j < a.length; j++) { const c = a[j]; if (valued.includes(c)) { flags[c] = j + 1 < a.length ? a.slice(j + 1) : args[++i]; break; } flags[c] = true; }
      continue;
    }
    rest.push(a);
  }
  return { flags, rest };
}
function input(names, stdin, command) {
  if (!names.length) return { out: stdin || [], err: [] };
  const out = [], err = [];
  for (const name of names) {
    const lines = read(name);
    if (lines) out.push(...lines);
    else err.push(`${command}: ${name}: ${isDir(resolve(name)) ? 'Is a directory' : 'No such file or directory'}`);
  }
  return { out, err };
}
function fieldList(spec) {
  const parts = String(spec).split(',').map(part => { const m = part.match(/^(\d*)-(\d*)$|^(\d+)$/); if (!m || part === '-') return null; if (m[3]) return [+m[3], +m[3]]; return [m[1] ? +m[1] : 1, m[2] ? +m[2] : Infinity]; });
  return parts.some(part => !part) ? null : i => parts.some(([a, b]) => i >= a && i <= b);
}
const count = flags => { const n = flags.n !== undefined && flags.n !== true ? flags.n : flags.num; return n === undefined ? 10 : parseInt(n, 10); };
function cow(lines) {
  const text = lines.length ? lines : [''], width = Math.max(...text.map(line => line.length));
  const edge = (l, r, line) => `${l} ${line.padEnd(width)} ${r}`;
  const body = text.length === 1 ? [edge('<', '>', text[0])] : text.map((line, i) => i === 0 ? edge('/', '\\', line) : i === text.length - 1 ? edge('\\', '/', line) : edge('|', '|', line));
  return [' ' + '_'.repeat(width + 2), ...body, ' ' + '-'.repeat(width + 2), '        \\   ^__^', '         \\  (oo)\\_______', '            (__)\\       )\\/\\', '                ||----w |', '                ||     ||'];
}
function whois(ip) {
  const block = [[/^203\.0\.113\./, '203.0.113.0 - 203.0.113.255', '203.0.113.0/24', 'TEST-NET-3'], [/^198\.51\.100\./, '198.51.100.0 - 198.51.100.255', '198.51.100.0/24', 'TEST-NET-2'],
    [/^192\.0\.2\./, '192.0.2.0 - 192.0.2.255', '192.0.2.0/24', 'TEST-NET-1'], [/^10\./, '10.0.0.0 - 10.255.255.255', '10.0.0.0/8', 'PRIVATE-ADDRESS-ABLK-RFC1918-IANA-RESERVED']].find(([re]) => re.test(ip));
  if (!block) return ['No match found for ' + ip + '.'];
  const [, range, cidr, name] = block;
  return [`NetRange:       ${range}`, `CIDR:           ${cidr}`, `NetName:        ${name}`, 'Organization:   Internet Assigned Numbers Authority (IANA)',
    ...(name.startsWith('TEST') ? ['Comment:        Set aside for examples and documentation,', 'Comment:        like this page. No real attacker lives here.'] : ['Comment:        Private addresses, used inside an organisation\'s own network.'])];
}
function drawTree(dir) {
  const prefix = dir === '/' ? '/' : dir + '/', root = {};
  for (const key of Object.keys(FS)) if (key.startsWith(prefix)) {
    let node = root;
    for (const part of key.slice(prefix.length).split('/')) node = node[part] ??= {};
  }
  const out = ['.']; let dirs = 0, files = 0;
  const walk = (node, lead) => Object.keys(node).sort().forEach((name, i, names) => {
    const last = i === names.length - 1, children = node[name];
    out.push(`${lead}${last ? '└── ' : '├── '}${name}`);
    if (Object.keys(children).length) { dirs++; walk(children, lead + (last ? '    ' : '│   ')); } else files++;
  });
  walk(root, '');
  out.push('', `${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`);
  return out;
}
const slow = lines => ({ out: lines, slow: true });
function apt(args, root) {
  const [verb, ...names] = args;
  const locked = ['E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)', 'E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?'];
  if (verb === 'search') {
    const word = (names[0] || '').toLowerCase();
    if (!word) return fail('E: You must give at least one search pattern');
    const hits = Object.entries(PACKAGES).filter(([name, p]) => name.includes(word) || p.about.includes(word));
    return { out: ['Sorting... Done', 'Full Text Search... Done', ...hits.flatMap(([name, p]) => [`${name}/noble ${p.version} amd64${installed.has(name) ? ' [installed]' : ''}`, `  ${p.about}`, ''])] };
  }
  if (verb === 'install' || verb === 'remove') {
    if (!root) return { out: [], err: locked };
    if (!names.length) return fail(`E: Say which package to ${verb}, as in apt ${verb} whois`);
    const unknown = names.find(name => !PACKAGES[name]);
    if (unknown) return { out: ['Reading package lists... Done', 'Building dependency tree... Done'], err: [`E: Unable to locate package ${unknown}`] };
    const head = ['Reading package lists... Done', 'Building dependency tree... Done'];
    if (verb === 'remove') {
      const gone = names.filter(name => installed.has(name)); gone.forEach(name => installed.delete(name));
      return slow([...head, ...(gone.length ? ['The following packages will be REMOVED:', `  ${gone.join(' ')}`, ...gone.map(name => `Removing ${name} (${PACKAGES[name].version}) ...`)] : [`Package '${names[0]}' is not installed, so not removed`])]);
    }
    const fresh = names.filter(name => !installed.has(name));
    if (!fresh.length) return { out: [...head, ...names.map(name => `${name} is already the newest version (${PACKAGES[name].version}).`), '0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.'] };
    fresh.forEach(name => installed.add(name));
    return slow([...head, 'The following NEW packages will be installed:', `  ${fresh.join(' ')}`,
      ...fresh.map((name, i) => `Get:${i + 1} http://archive.ubuntu.com/ubuntu noble/main amd64 ${name} amd64 ${PACKAGES[name].version} [${PACKAGES[name].size}]`),
      ...fresh.flatMap(name => [`Unpacking ${name} (${PACKAGES[name].version}) ...`, `Setting up ${name} (${PACKAGES[name].version}) ...`])]);
  }
  if (verb === 'upgrade') {
    if (!root) return { out: [], err: locked };
    const head = ['Reading package lists... Done', 'Building dependency tree... Done', 'Calculating upgrade... Done'];
    if (upgraded) return { out: [...head, '0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.'] };
    upgraded = true;
    return slow([...head, 'The following packages will be upgraded:', `  ${UPGRADES.join(' ')}`, `${UPGRADES.length} upgraded, 0 newly installed, 0 to remove and 0 not upgraded.`, ...UPGRADES.map(name => `Setting up ${name} ...`)]);
  }
  return fail('usage: apt search WORD | apt install PACKAGE | apt remove PACKAGE | apt upgrade');
}
// Homebrew on a Mac does the same job without sudo.
function brew(args) {
  const [verb, ...names] = args;
  if (verb === 'search') { const word = (names[0] || '').toLowerCase(); return { out: Object.keys(PACKAGES).filter(name => name.includes(word)) }; }
  if (verb === 'install') {
    const unknown = names.find(name => !PACKAGES[name]);
    if (!names.length || unknown) return fail(`Error: No available formula with the name "${unknown ?? ''}".`);
    const fresh = names.filter(name => !installed.has(name)); fresh.forEach(name => installed.add(name));
    return fresh.length ? slow(fresh.flatMap(name => [`==> Downloading https://ghcr.io/v2/homebrew/core/${name}`, `==> Pouring ${name}--${PACKAGES[name].version}.bottle.tar.gz`, `🍺  ${name} ${PACKAGES[name].version} is installed`])) : { out: [`Warning: ${names[0]} is already installed and up-to-date.`] };
  }
  if (verb === 'upgrade') { if (upgraded) return { out: [] }; upgraded = true; return slow(['==> Upgrading 6 outdated packages:', ...UPGRADES.map(name => `${name} → newer`)]); }
  return fail('Example usage: brew search WORD, brew install FORMULA, brew upgrade');
}

const COMMANDS = {
  cat: (a, stdin) => input(options(a).rest, stdin, 'cat'),
  grep(a, stdin) {
    const { flags, rest } = options(a);
    if (!rest.length) return fail('usage: grep [-v] [-i] [-c] PATTERN [FILE]');
    const pattern = rest.shift(); let re;
    try { re = new RegExp(pattern, flags.i ? 'i' : ''); } catch { re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.i ? 'i' : ''); }
    const r = input(rest, stdin, 'grep'), out = r.out.filter(line => re.test(line) !== !!flags.v);
    return { out: flags.c ? [String(out.length)] : out, err: r.err };
  },
  cut(a, stdin) {
    const { flags, rest } = options(a, 'dfc'), spec = flags.f || flags.c;
    if (!spec || spec === true) return fail('cut: say which columns with -f (or characters with -c)');
    const want = fieldList(spec);
    if (!want) return fail(`cut: invalid list: ${spec}`);
    const d = flags.d === undefined || flags.d === true ? '\t' : flags.d;
    if (flags.f && d.length !== 1) return fail('cut: the delimiter must be a single character');
    const r = input(rest, stdin, 'cut');
    return { out: r.out.map(line => flags.c ? [...line].filter((_, i) => want(i + 1)).join('') : !line.includes(d) ? line : line.split(d).filter((_, i) => want(i + 1)).join(d)), err: r.err };
  },
  sort(a, stdin) {
    const { flags, rest } = options(a), r = input(rest, stdin, 'sort'), order = (x, y) => x < y ? -1 : x > y ? 1 : 0;
    let out = [...r.out].sort((x, y) => (flags.n ? (parseFloat(x) || 0) - (parseFloat(y) || 0) : 0) || order(x, y));
    if (flags.r) out.reverse();
    if (flags.u) out = out.filter((line, i) => i === 0 || line !== out[i - 1]);
    return { out, err: r.err };
  },
  uniq(a, stdin) {
    const { flags, rest } = options(a), r = input(rest, stdin, 'uniq'), out = []; let prev = null, n = 0;
    const flush = () => { if (prev !== null) out.push(flags.c ? String(n).padStart(7) + ' ' + prev : prev); };
    for (const line of r.out) { if (line === prev) n++; else { flush(); prev = line; n = 1; } }
    flush();
    return { out, err: r.err };
  },
  head(a, stdin) { const { flags, rest } = options(a, 'n'), n = count(flags); if (isNaN(n)) return fail('head: invalid number of lines'); const r = input(rest, stdin, 'head'); return { out: r.out.slice(0, n), err: r.err }; },
  tail(a, stdin) { const { flags, rest } = options(a, 'n'), n = count(flags); if (isNaN(n)) return fail('tail: invalid number of lines'); const r = input(rest, stdin, 'tail'); return { out: r.out.slice(Math.max(0, r.out.length - n)), err: r.err }; },
  wc(a, stdin) {
    const { flags, rest } = options(a), r = input(rest, stdin, 'wc');
    const lines = r.out.length, words = r.out.join(' ').split(/\s+/).filter(Boolean).length, chars = r.out.reduce((sum, line) => sum + line.length + 1, 0);
    const counts = []; if (flags.l) counts.push(lines); if (flags.w) counts.push(words); if (flags.c) counts.push(chars); if (!counts.length) counts.push(lines, words, chars);
    let line = counts.length === 1 ? String(counts[0]) : counts.map(n => String(n).padStart(7)).join(' ');
    if (rest.length === 1) line += ' ' + rest[0];
    return { out: [line], err: r.err };
  },
  ls(a) {
    const out = [], err = [];
    for (const target of options(a).rest.length ? options(a).rest : ['.']) {
      const path = resolve(target);
      if (FS[path] !== undefined) { out.push(target); continue; }
      if (!isDir(path)) { err.push(`ls: cannot access '${target}': No such file or directory`); continue; }
      const prefix = path === '/' ? '/' : path + '/', names = new Set();
      for (const key of Object.keys(FS)) if (key.startsWith(prefix)) { const rel = key.slice(prefix.length); names.add(rel.includes('/') ? rel.split('/')[0] + '/' : rel); }
      out.push(...[...names].sort());
    }
    return { out, err };
  },
  cd(a) { const path = resolve(a[0] || '~'); if (!isDir(path)) return fail(`cd: ${a[0]}: No such directory`); ctx.cwd = path; return { out: [] }; },
  pwd: () => ({ out: [ctx.cwd] }),
  echo: a => ({ out: [a.join(' ')] }),
  whoami: () => ({ out: ['you'] }),
  hostname: () => ({ out: read('/etc/hostname') }),
  clear: () => ({ out: [], clear: true }),
  sudo: (a, stdin, depth) => a.length ? exec(a, stdin, depth, true) : fail('usage: sudo COMMAND'),
  apt: (a, stdin, depth, root) => apt(a, root),
  brew: a => brew(a),
  help: () => ({ out: ['Commands you can try here:', '', ...Object.entries(DOCS).filter(([name]) => !PACKAGES[name] || installed.has(name)).map(([name, doc]) => `  ${name.padEnd(9)}${doc.summary}`), '', 'Add --help to any of them, or type man NAME.'] }),
  man(a) {
    const name = a[0];
    if (!name) return fail('What manual page do you want?');
    const doc = DOCS[name];
    if (!doc || (PACKAGES[name] && !installed.has(name))) return fail(`No manual entry for ${name}`);
    return { out: [`${name.toUpperCase()}(1)`, '', 'NAME', `    ${name} - ${doc.summary}`, '', 'SYNOPSIS', `    ${doc.usage}`,
      ...(doc.options ? ['', 'OPTIONS', ...doc.options.map(([flag, says]) => `    ${flag.padEnd(8)}${says}`)] : []), ...(doc.example ? ['', 'EXAMPLE', `    ${doc.example}`] : [])] };
  },
  apropos(a) {
    const word = (a[0] || '').toLowerCase();
    if (!word) return fail('apropos what?');
    const hits = Object.entries(DOCS).filter(([name, doc]) => (!PACKAGES[name] || installed.has(name)) && (name.includes(word) || doc.summary.toLowerCase().includes(word)));
    return hits.length ? { out: hits.map(([name, doc]) => `${name.padEnd(9)}(1) - ${doc.summary}`) } : fail(`${word}: nothing appropriate.`);
  },
  whois: a => a[0] ? { out: whois(a[0]) } : fail('Usage: whois ADDRESS'),
  cowsay: (a, stdin) => ({ out: cow(a.length ? [a.join(' ')] : stdin || []) }),
  tree: a => { const path = resolve(a[0] || '.'); return isDir(path) ? { out: drawTree(path) } : fail(`${a[0]} [error opening dir]`); },
};
export const DOCS = {
  cat: { summary: 'print files, one after another', usage: 'cat [FILE]...', example: 'cat /etc/hostname' },
  grep: { summary: 'keep only the lines that match a pattern', usage: 'grep [-v] [-i] [-c] PATTERN [FILE]...', options: [['-v', 'keep the lines that do NOT match'], ['-i', 'ignore upper and lower case'], ['-c', 'count the matching lines instead']], example: "grep ' 401 ' access.log" },
  cut: { summary: 'keep some columns of each line', usage: 'cut -d DELIM -f LIST [FILE]', options: [['-d', 'what separates the columns (tab by default)'], ['-f', 'which columns: 1, or 1,3, or 2-4'], ['-c', 'which characters, instead of columns']], example: "cut -d' ' -f1 access.log" },
  sort: { summary: 'put lines in order', usage: 'sort [-r] [-n] [-u] [FILE]', options: [['-r', 'reverse the order'], ['-n', 'compare as numbers, so 9 comes before 10'], ['-u', 'drop duplicate lines']], example: 'sort -rn' },
  uniq: { summary: 'squash repeated neighbouring lines, and count them with -c', usage: 'uniq [-c] [FILE]', options: [['-c', 'put the count in front of each line']], example: 'sort | uniq -c' },
  head: { summary: 'keep the first lines', usage: 'head [-n N] [FILE]', options: [['-n N', 'how many (10 by default); -N works too']], example: 'head -3' },
  tail: { summary: 'keep the last lines', usage: 'tail [-n N] [FILE]', options: [['-n N', 'how many (10 by default)']], example: 'tail -n 5 access.log' },
  wc: { summary: 'count lines, words and characters', usage: 'wc [-l] [-w] [-c] [FILE]', options: [['-l', 'lines only'], ['-w', 'words only'], ['-c', 'characters only']], example: "grep ' 401 ' access.log | wc -l" },
  ls: { summary: 'list the files in a directory', usage: 'ls [DIR]', example: 'ls /etc' },
  cd: { summary: 'move to another directory', usage: 'cd [DIR]', example: 'cd /proc' },
  pwd: { summary: 'print which directory you are in', usage: 'pwd' },
  echo: { summary: 'print its arguments', usage: 'echo [TEXT]...', example: 'echo hello > note.txt' },
  apt: { summary: 'find, install and update software from the package repository', usage: 'apt search WORD | sudo apt install PACKAGE | sudo apt upgrade', example: 'sudo apt install cowsay' },
  sudo: { summary: 'run a command as the administrator', usage: 'sudo COMMAND', example: 'sudo apt upgrade' },
  man: { summary: 'show the manual for a command', usage: 'man COMMAND', example: 'man grep' },
  apropos: { summary: 'search the manuals for a word', usage: 'apropos WORD', example: 'apropos count' },
  clear: { summary: 'clear the screen', usage: 'clear' },
  whois: { summary: 'look up who an internet address belongs to', usage: 'whois ADDRESS', example: `whois ${ATTACKER}` },
  cowsay: { summary: 'have a cow say something', usage: 'cowsay [TEXT]', example: 'echo moo | cowsay' },
  tree: { summary: 'draw the files under a directory as a tree', usage: 'tree [DIR]', example: 'tree /etc' },
};
const helpFor = name => { const doc = DOCS[name]; return [`usage: ${doc.usage}`, `${doc.summary[0].toUpperCase()}${doc.summary.slice(1)}.`, ...(doc.options || []).map(([flag, says]) => `  ${flag.padEnd(8)}${says}`)]; };
const quote = s => "'" + String(s).replace(/'/g, "'\\''") + "'";

// Runs one command: a built-in tool, an installed package, or a script with #! on its first line.
function exec(argv, stdin, depth, root = false) {
  const [name, ...args] = argv;
  const missing = PACKAGES[name] && !installed.has(name);
  let r;
  if (missing) r = fail(`Command '${name}' not found, but can be installed with:\n  sudo apt install ${name}`);
  else if (args.includes('--help') && DOCS[name]) r = { out: helpFor(name) };
  else if (COMMANDS[name]) r = COMMANDS[name](args, stdin, depth, root);
  else {
    const path = name.includes('/') ? resolve(name) : [`${HOME}/bin/${name}`].find(candidate => FS[candidate]);
    const body = path && read(path);
    if (body?.[0]?.startsWith('#!')) {
      if (depth > 4) return fail(`${name}: calls itself too deeply`);
      const out = [], err = []; let first = true;
      for (const line of body.slice(1)) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const r = runLine(line.replace(/"\$(\d)"|\$(\d)/g, (_, a, b) => quote(args[(a || b) - 1] ?? '')), depth + 1, first ? stdin : null);
        first = false; out.push(...r.out); err.push(...r.err);
      }
      r = { out, err };
    } else r = fail(body ? `sh: ${name}: Permission denied` : `sh: ${name}: command not found`);
  }
  return { out: r.out || [], err: (r.err || []).flatMap(line => line.split('\n')), clear: r.clear, slow: r.slow };
}
function runPipeline(tokens, depth, stdin) {
  const stages = [[]]; let redirect = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.op === '|') { stages.push([]); continue; }
    if (t.op === '>' || t.op === '>>') { const target = tokens[i + 1]; if (!target || target.op) return fail('sh: syntax error: where should the output go?'); redirect = { op: t.op, path: target.v }; i++; continue; }
    stages.at(-1).push(t.v);
  }
  if (stages.some(stage => !stage.length)) return fail("sh: syntax error near '|'");
  let data = stdin, slow = false; const err = [];
  for (const argv of stages) { const r = exec(argv, data, depth); if (r.clear) return r; err.push(...r.err); data = r.out; slow = r.slow; }
  if (redirect) {
    const path = resolve(redirect.path);
    if (isDir(path)) return fail(`sh: ${redirect.path}: Is a directory`);
    if (path.startsWith('/proc/')) return fail(`sh: ${redirect.path}: Permission denied`);
    const current = FS[path];
    FS[path] = redirect.op === '>>' && Array.isArray(current) ? [...current, ...data] : [...data];
    watchers.forEach(watch => watch(path));
    return { out: [], err };
  }
  return { out: data, err, slow };
}
// Runs a line of shell: pipelines with |, separated by ;, each optionally ending in > or >> FILE.
// A script's first command can be given the lines piped into the script.
export function runLine(line, depth = 0, stdin = null) {
  const t = tokenize(line);
  if (t.error) return fail(t.error);
  const statements = [[]];
  for (const token of t.tokens) { if (token.op === ';') statements.push([]); else statements.at(-1).push(token); }
  const out = [], err = []; let slow = false;
  for (const statement of statements) {
    if (!statement.length) continue;
    const r = runPipeline(statement, depth, stdin);
    if (r.clear) return r;
    out.push(...r.out); err.push(...r.err); slow ||= !!r.slow;
  }
  return { out, err, slow };
}
