// A small sandbox that runs a parsed command line on pretend files, for the Toolbox lessons. The
// parser has already worked out where every descriptor points, so running a pipeline is a matter of
// feeding each command's stdin and collecting what it writes. Commands run one after another, each
// to the end, which gives the same result as a real pipeline for the finite text used here.
//
// Each tool is a function of its arguments, its stdin as a string, and a context, and returns what
// it wrote on stdout and stderr and its exit status. Their output follows GNU coreutils on Linux,
// with the BSD spacing of `wc` and `uniq -c` on macOS.

const MAX = 200000;
const lines = text => text === '' ? [] : text.replace(/\n$/, '').split('\n');
const joined = list => list.map(line => `${line}\n`).join('');

// Options in the getopt style: -abc clusters, -n5 or -n 5 for a value, -- to stop, and long options
// mapped to short ones. GNU tools take options after operands as well, so this does too.
function getopt(args, flags, valued = '', long = {}) {
  const opts = {}, operands = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { operands.push(...args.slice(i + 1)); break; }
    if (arg.startsWith('--') && arg.length > 2) {
      const [name, value] = arg.slice(2).split(/=(.*)/s);
      const short = long[name];
      if (!short) return { error: `unrecognized option '${arg}'` };
      opts[short] = valued.includes(short) ? (value ?? args[++i]) : true;
      continue;
    }
    if (arg.length < 2 || arg[0] !== '-') { operands.push(arg); continue; }
    for (let j = 1; j < arg.length; j++) {
      const c = arg[j];
      if (valued.includes(c)) {
        const value = arg.slice(j + 1) || args[++i];
        if (value === undefined) return { error: `option requires an argument -- '${c}'` };
        opts[c] = [...(opts[c] ?? []), value];
        break;
      }
      if (!flags.includes(c)) return { error: `invalid option -- '${c}'` };
      opts[c] = true;
    }
  }
  // A valued option given once is its value; given again, the last one wins, except where a tool
  // collects them all (grep -e).
  for (const c of valued) if (Array.isArray(opts[c])) opts[`${c}*`] = opts[c], opts[c] = opts[c].at(-1);
  return { opts, operands };
}

const fail = (name, message, status = 1, help = true) => ({ out: '', err: `${name}: ${message}\n${help ? `Try '${name} --help' for more information.\n` : ''}`, status });
const missing = (name, file) => `${name}: ${file}: No such file or directory\n`;

// Reads each operand, or stdin for none or "-". Missing files are reported and skipped.
function inputs(name, operands, stdin, ctx) {
  const read = [], errors = [];
  for (const file of operands.length ? operands : ['-']) {
    if (file === '-') { read.push({ file, text: ctx.readStdin(stdin) }); continue; }
    const text = ctx.files[file];
    if (text === undefined) errors.push(missing(name, file));
    else read.push({ file, text });
  }
  return { read, err: errors.join(''), status: errors.length ? 1 : 0 };
}

// Patterns. grep and sed take basic regular expressions, where ( ) { } | + ? are plain characters
// unless escaped; -E makes them extended, as JavaScript's are. Bracket classes such as [:digit:] and
// the word edges \< and \> are turned into their JavaScript spellings.
const classes = { alpha: 'a-zA-Z', digit: '0-9', alnum: 'a-zA-Z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v', blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f' };
function regex(pattern, { extended = false, fixed = false, ignoreCase = false, word = false, line = false, global = false } = {}) {
  let source = '';
  if (fixed) source = pattern.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  else {
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '[') {
        let j = i + 1, body = '';
        if (pattern[j] === '^') { body += '^'; j++; }
        if (pattern[j] === ']') { body += '\\]'; j++; }
        while (j < pattern.length && pattern[j] !== ']') {
          const named = pattern.slice(j).match(/^\[:(\w+):\]/);
          if (named && classes[named[1]]) { body += classes[named[1]]; j += named[0].length; continue; }
          body += pattern[j] === '\\' ? '\\\\' : pattern[j];
          j++;
        }
        if (j >= pattern.length) throw new Error('Unmatched [, [^, [:, [., or [=');
        source += `[${body}]`; i = j; continue;
      }
      if (c === '\\') {
        const next = pattern[++i];
        if (next === undefined) throw new Error('Trailing backslash');
        if (next === '<' || next === '>') source += '\\b';
        else if (!extended && '(){}|+?'.includes(next)) source += next;
        else if (/[1-9wWsSbB]/.test(next)) source += `\\${next}`;
        else source += `\\${next}`.replace(/^\\([a-zA-Z0-9])$/, '$1');
        continue;
      }
      if (!extended && '(){}|+?'.includes(c)) { source += `\\${c}`; continue; }
      if (c === '*' && (!source || source.endsWith('(') || source === '^')) { source += '\\*'; continue; }
      source += c;
    }
  }
  if (word) source = `(?<![\\w])(?:${source})(?![\\w])`;
  if (line) source = `^(?:${source})$`;
  try { return new RegExp(source, `${ignoreCase ? 'i' : ''}${global ? 'g' : ''}`); } catch { throw new Error('Invalid regular expression'); }
}

// tr's sets: ranges, classes and escapes, spelled out character by character.
function trSet(spec) {
  const out = [];
  const escapes = { n: '\n', t: '\t', r: '\r', '\\': '\\' };
  for (let i = 0; i < spec.length; i++) {
    const named = spec.slice(i).match(/^\[:(\w+):\]/);
    if (named) {
      const ranges = { alpha: 'a-zA-Z', digit: '0-9', alnum: '0-9A-Za-z', upper: 'A-Z', lower: 'a-z', space: ' \t\n\r\f\v', blank: ' \t', punct: '!-/:-@[-`{-~' }[named[1]];
      if (!ranges) throw new Error(`invalid character class '${named[1]}'`);
      out.push(...trSet(ranges.replace(/\\/g, '\\\\')));
      i += named[0].length - 1; continue;
    }
    let c = spec[i];
    if (c === '\\' && i + 1 < spec.length) c = escapes[spec[++i]] ?? spec[i];
    if (spec[i + 1] === '-' && i + 2 < spec.length) {
      let end = spec[i + 2], skip = 2;
      if (end === '\\' && i + 3 < spec.length) { end = escapes[spec[i + 3]] ?? spec[i + 3]; skip = 3; }
      if (end.charCodeAt(0) < c.charCodeAt(0)) throw new Error(`range-endpoints of '${c}-${end}' are in reverse collating sequence order`);
      for (let code = c.charCodeAt(0); code <= end.charCodeAt(0); code++) out.push(String.fromCharCode(code));
      i += skip; continue;
    }
    out.push(c);
  }
  return out;
}

// Field lists for cut: 1,3-5,7- and the like.
function fieldList(spec) {
  const parts = spec.split(',').map(part => {
    const m = part.match(/^(\d*)(-?)(\d*)$/);
    if (!m || (!m[1] && !m[3])) return null;
    const from = Number(m[1] || 1), to = m[2] ? (m[3] ? Number(m[3]) : Infinity) : from;
    return from >= 1 && to >= from ? [from, to] : null;
  });
  if (parts.includes(null)) return null;
  return n => parts.some(([from, to]) => n >= from && n <= to);
}

// The longest common subsequence of two lists of lines, as pairs of matching indexes, for diff.
function common(a, b) {
  const rows = a.length + 1, cols = b.length + 1, table = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
  }
  const pairs = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) i++;
    else j++;
  }
  return pairs;
}
// Runs of change between matching lines: [a start, a end, b start, b end], ends exclusive.
function hunks(a, b) {
  const out = [];
  let i = 0, j = 0;
  for (const [mi, mj] of [...common(a, b), [a.length, b.length]]) {
    if (mi > i || mj > j) out.push([i, mi, j, mj]);
    i = mi + 1; j = mj + 1;
  }
  return out;
}

const pad = (n, width) => String(n).padStart(width);
const numeric = line => { const m = line.match(/^\s*([-+]?(?:\d+\.?\d*|\.\d+))/); return m ? Number(m[1]) : 0; };
const bytes = text => new TextEncoder().encode(text).length;

// Manual pages for `man`, and the cards the lessons show. summary is one line; options are the
// handful worth knowing first.
export const tools = {
  ls: { summary: 'lists the files in a directory', usage: 'ls [-l] [-a] [file…]', options: [['-l', 'long listing: permissions, size, date'], ['-a', 'show hidden files too, the ones starting with .'], ['-1', 'one name per line']] },
  cat: { summary: 'prints files one after another, as one stream', usage: 'cat [-n] [file…]', options: [['-n', 'number the lines']] },
  head: { summary: 'prints the first lines of its input', usage: 'head [-n N] [file…]', options: [['-n N', 'the first N lines (10 if you don’t say)'], ['-c N', 'the first N bytes']] },
  tail: { summary: 'prints the last lines of its input', usage: 'tail [-n N] [file…]', options: [['-n N', 'the last N lines'], ['-n +N', 'everything from line N on'], ['-f', 'keep watching the file for new lines (not here)']] },
  wc: { summary: 'counts lines, words and bytes', usage: 'wc [-l] [-w] [-c] [file…]', options: [['-l', 'lines only'], ['-w', 'words only'], ['-c', 'bytes only']] },
  diff: { summary: 'shows the lines that differ between two files', usage: 'diff [-u] file1 file2', options: [['-u', 'unified format, the one git shows'], ['-q', 'only say whether they differ']] },
  grep: { summary: 'prints the lines that match a pattern', usage: 'grep [-ivcnw] pattern [file…]', options: [['-i', 'ignore case'], ['-v', 'print the lines that don’t match'], ['-c', 'count matching lines instead'], ['-n', 'number the lines'], ['-w', 'match whole words only'], ['-E', 'extended patterns: a|b, (ab)+']] },
  '|': { summary: 'joins one command’s stdout to the next one’s stdin', usage: 'command1 | command2', options: [] },
  cut: { summary: 'keeps chosen fields or characters from each line', usage: 'cut -d DELIM -f LIST [file…]', options: [['-d C', 'split at C (a tab if you don’t say)'], ['-f LIST', 'fields to keep: 3, or 1,3, or 2-4'], ['-c LIST', 'characters to keep']] },
  sort: { summary: 'sorts lines', usage: 'sort [-rnu] [-k N] [-t C] [file…]', options: [['-r', 'reverse'], ['-n', 'by number, not alphabetically'], ['-u', 'drop repeated lines'], ['-k N', 'sort by field N'], ['-t C', 'fields are split at C']] },
  uniq: { summary: 'collapses runs of the same line into one', usage: 'uniq [-c] [-d] [file]', options: [['-c', 'count each run'], ['-d', 'only lines that repeat'], ['-u', 'only lines that don’t']] },
  tr: { summary: 'translates or deletes characters; reads stdin only', usage: 'tr [-d] [-s] SET1 [SET2]', options: [['a-z A-Z', 'map each character of SET1 to SET2'], ['-d SET', 'delete these characters'], ['-s SET', 'squeeze runs of them into one']] },
  tee: { summary: 'copies its stdin to stdout and to files', usage: 'tee [-a] file…', options: [['-a', 'append rather than overwrite']] },
  sed: { summary: 'edits a stream: substitute, delete, print', usage: "sed [-n] [-E] 's/old/new/g' [file…]", options: [['s/a/b/', 'replace the first a on each line with b'], ['s/a/b/g', 'replace every a'], ['/re/d', 'delete matching lines'], ['-n /re/p', 'print only matching lines']] },
  awk: { summary: 'a little language for columns of text', usage: "awk [-F C] '{print $2}' [file…]", options: [['-F C', 'fields are split at C'], ['$1, $2 …', 'the fields of each line'], ['NR, NF', 'line number, number of fields']] },
  echo: { summary: 'prints its arguments', usage: 'echo [-n] [word…]', options: [['-n', 'no newline at the end']] },
  rev: { summary: 'reverses each line, character by character', usage: 'rev [file…]', options: [] },
  tac: { summary: 'prints lines last to first: cat backwards', usage: 'tac [file…]', options: [] },
  nl: { summary: 'numbers lines', usage: 'nl [file…]', options: [] },
  seq: { summary: 'prints a sequence of numbers', usage: 'seq [first] last', options: [] },
  man: { summary: 'shows the manual for a command', usage: 'man command', options: [] },
};

function manPage(name) {
  const tool = tools[name];
  if (!tool) return null;
  const width = Math.max(0, ...tool.options.map(([flag]) => flag.length));
  return [`${name.toUpperCase()}`, '', `  ${name} ${tool.summary}`, '', `  ${tool.usage}`, ...(tool.options.length ? ['', ...tool.options.map(([flag, text]) => `  ${flag.padEnd(width)}   ${text}`)] : [])].join('\n') + '\n';
}

const commands = {
  cat(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'nAbeEsTuv', '', { number: 'n' });
    if (error) return fail('cat', error);
    const { read, err, status } = inputs('cat', operands, stdin, ctx);
    let out = read.map(input => input.text).join('');
    if (opts.n) out = joined(lines(out).map((line, i) => `${pad(i + 1, 6)}\t${line}`));
    return { out, err, status };
  },
  ls(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'la1AhtrS', '', { all: 'a' });
    if (error) return fail('ls', error);
    const names = Object.keys(ctx.files).filter(name => !name.includes('/') && (opts.a || !name.startsWith('.'))).sort();
    let err = '', status = 0;
    const shown = operands.length ? operands.filter(name => {
      if (ctx.files[name] !== undefined) return true;
      err += ctx.platform === 'macos' ? `ls: ${name}: No such file or directory\n` : `ls: cannot access '${name}': No such file or directory\n`;
      status = 2;
      return false;
    }) : (opts.a ? ['.', '..', ...names] : names);
    if (opts.r) shown.reverse();
    if (opts.l) {
      const size = name => name === '.' || name === '..' ? 4096 : bytes(ctx.files[name]);
      const width = Math.max(...shown.map(name => String(size(name)).length), 1);
      const row = name => `${name === '.' || name === '..' ? 'drwxr-xr-x 2' : '-rw-r--r-- 1'} you you ${pad(size(name), width)} Oct  2 15:30 ${name}`;
      return { out: joined([...(operands.length ? [] : [`total ${shown.length * 4}`]), ...shown.map(row)]), err, status };
    }
    // To a terminal ls sets names out in columns; into a pipe or file, one per line.
    return { out: shown.length ? (ctx.tty && !opts['1'] ? `${shown.join('  ')}\n` : joined(shown)) : '', err, status };
  },
  head(args, stdin, ctx) { return ends('head', args, stdin, ctx); },
  tail(args, stdin, ctx) { return ends('tail', args, stdin, ctx); },
  wc(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'lwcmL', '', { lines: 'l', words: 'w', bytes: 'c', chars: 'm' });
    if (error) return fail('wc', error);
    const { read, err, status } = inputs('wc', operands, stdin, ctx);
    const kinds = ['l', 'w', 'c', 'm'].filter(k => opts[k]);
    const chosen = kinds.length ? kinds : ['l', 'w', 'c'];
    const count = text => ({ l: (text.match(/\n/g) ?? []).length, w: text.split(/\s+/).filter(Boolean).length, c: bytes(text), m: [...text].length });
    const rows = read.map(({ file, text }) => ({ name: file === '-' ? '' : file, counts: count(text) }));
    if (rows.length > 1) rows.push({ name: 'total', counts: Object.fromEntries(chosen.map(k => [k, rows.reduce((sum, row) => sum + row.counts[k], 0)])) });
    // GNU pads every count to the width of the largest possible one, or 7 when reading stdin, and
    // not at all for a single count of a single input. BSD pads each count to 8.
    const fromStdin = read.some(input => input.file === '-');
    const width = ctx.platform === 'macos' ? 8 : chosen.length === 1 && rows.length === 1 ? 1 : fromStdin ? 7 : String(Math.max(...rows.map(row => row.counts.c ?? bytes(read.map(i => i.text).join(''))))).length;
    const out = rows.map(row => {
      const counts = chosen.map(k => pad(row.counts[k], width)).join(ctx.platform === 'macos' ? '' : ' ');
      return row.name ? `${counts} ${row.name}` : counts;
    });
    return { out: joined(out), err, status };
  },
  grep(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'ivcnwxoEFGlLhHqsr', 'eA', { 'ignore-case': 'i', 'invert-match': 'v', count: 'c', 'line-number': 'n', 'word-regexp': 'w', 'line-regexp': 'x', 'only-matching': 'o', 'extended-regexp': 'E', 'fixed-strings': 'F', 'files-with-matches': 'l', quiet: 'q', regexp: 'e' });
    if (error) return { out: '', err: `grep: ${error}\nUsage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n`, status: 2 };
    const patterns = opts['e*'] ?? (operands.length ? [operands.shift()] : null);
    if (!patterns) return { out: '', err: 'Usage: grep [OPTION]... PATTERNS [FILE]...\nTry \'grep --help\' for more information.\n', status: 2 };
    let tests;
    try { tests = patterns.flatMap(p => p.split('\n')).map(p => regex(p, { extended: opts.E, fixed: opts.F, ignoreCase: opts.i, word: opts.w, line: opts.x, global: opts.o })); }
    catch (e) { return { out: '', err: `grep: ${e.message}\n`, status: 2 }; }
    const { read, err, status } = inputs('grep', operands, stdin, ctx);
    const named = (read.length > 1 || opts.H) && !opts.h;
    let out = '', found = false;
    for (const { file, text } of read) {
      const label = file === '-' ? '(standard input)' : file;
      let n = 0;
      const kept = [];
      lines(text).forEach((line, i) => {
        const hit = tests.some(re => { re.lastIndex = 0; return re.test(line); });
        if (hit === !!opts.v) return;
        n++;
        if (opts.o && !opts.v) {
          for (const re of tests) { re.lastIndex = 0; for (const m of line.matchAll(re)) if (m[0]) kept.push(`${named ? `${label}:` : ''}${opts.n ? `${i + 1}:` : ''}${m[0]}`); }
        } else kept.push(`${named ? `${label}:` : ''}${opts.n ? `${i + 1}:` : ''}${line}`);
      });
      if (n) found = true;
      if (opts.q) continue;
      if (opts.l) { if (n) out += `${label}\n`; continue; }
      if (opts.L) { if (!n) out += `${label}\n`; continue; }
      out += opts.c ? `${named ? `${label}:` : ''}${n}\n` : joined(kept);
    }
    return { out, err: opts.s ? '' : err, status: status && !found ? 2 : found ? 0 : 1 };
  },
  sort(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'rnufbsdhV', 'kto', { reverse: 'r', 'numeric-sort': 'n', unique: 'u', 'ignore-case': 'f', key: 'k', 'field-separator': 't' });
    if (error) return fail('sort', error);
    const { read, err, status } = inputs('sort', operands, stdin, ctx);
    if (status) return { out: '', err: err.replace(/^sort: (.*): No such/gm, 'sort: cannot read: $1: No such'), status: 2 };
    let key = line => line;
    if (opts.k) {
      const m = String(opts.k).match(/^(\d+)(?:\.\d+)?[a-z]*(?:,(\d+)(?:\.\d+)?[a-z]*)?$/);
      if (!m) return fail('sort', `invalid number at field start: invalid count at start of '${opts.k}'`, 2);
      const from = Number(m[1]), to = m[2] ? Number(m[2]) : Infinity;
      key = line => {
        const fields = opts.t ? line.split(opts.t) : line.trimStart().split(/\s+/);
        return fields.slice(from - 1, to).join(opts.t ?? ' ');
      };
    }
    const fold = s => opts.f ? s.toUpperCase() : s;
    const byte = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    const order = (a, b) => {
      const ka = key(a), kb = key(b);
      const primary = opts.n || opts.h ? numeric(ka) - numeric(kb) : byte(fold(ka), fold(kb));
      if (primary || opts.s || opts.u) return primary;
      return byte(a, b);
    };
    let sorted = read.flatMap(input => lines(input.text)).sort(order);
    if (opts.r) sorted.reverse();
    if (opts.u) sorted = sorted.filter((line, i) => i === 0 || order(sorted[i - 1], line) !== 0);
    return { out: joined(sorted), err, status };
  },
  uniq(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'cdui', '', { count: 'c', repeated: 'd', unique: 'u', 'ignore-case': 'i' });
    if (error) return fail('uniq', error);
    const { read, err, status } = inputs('uniq', operands.slice(0, 1), stdin, ctx);
    if (status) return { out: '', err, status };
    const runs = [];
    const same = (a, b) => opts.i ? a.toLowerCase() === b.toLowerCase() : a === b;
    for (const line of lines(read[0].text)) {
      if (runs.length && same(runs.at(-1).line, line)) runs.at(-1).n++;
      else runs.push({ line, n: 1 });
    }
    const width = ctx.platform === 'macos' ? 4 : 7;
    const out = runs.filter(run => (!opts.d || run.n > 1) && (!opts.u || run.n === 1)).map(run => opts.c ? `${pad(run.n, width)} ${run.line}` : run.line);
    return { out: joined(out), err, status };
  },
  cut(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 's', 'dfcb', { delimiter: 'd', fields: 'f', characters: 'c', bytes: 'b', 'only-delimited': 's' });
    if (error) return fail('cut', error);
    const list = opts.f ?? opts.c ?? opts.b;
    if (!list) return fail('cut', 'you must specify a list of bytes, characters, or fields');
    const keep = fieldList(list);
    if (!keep) return fail('cut', `invalid field value '${list}'`);
    if (opts.d !== undefined && opts.d.length !== 1) return fail('cut', 'the delimiter must be a single character');
    const { read, err, status } = inputs('cut', operands, stdin, ctx);
    const delim = opts.d ?? '\t';
    const out = read.flatMap(input => lines(input.text)).flatMap(line => {
      if (!opts.f) return [[...line].filter((_, i) => keep(i + 1)).join('')];
      if (!line.includes(delim)) return opts.s ? [] : [line];
      return [line.split(delim).filter((_, i) => keep(i + 1)).join(delim)];
    });
    return { out: joined(out), err, status };
  },
  tr(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'dscC', '', { delete: 'd', 'squeeze-repeats': 's', complement: 'c' });
    if (error) return fail('tr', error);
    const wanted = opts.d && !opts.s ? 1 : opts.s && !opts.d && operands.length === 1 ? 1 : 2;
    if (!operands.length) return fail('tr', 'missing operand');
    if (operands.length > wanted) return fail('tr', `extra operand '${operands[wanted]}'${opts.d ? '\nOnly one string may be given when deleting without squeezing repeats.' : ''}`);
    if (operands.length < wanted) return fail('tr', `missing operand after '${operands[0]}'\nTwo strings must be given when translating.`);
    let set1, set2;
    try { set1 = trSet(operands[0]); set2 = operands[1] !== undefined ? trSet(operands[1]) : null; } catch (e) { return fail('tr', e.message, 1, false); }
    const text = ctx.readStdin(stdin);
    const inSet1 = opts.c || opts.C ? c => !set1.includes(c) : c => set1.includes(c);
    let out = '';
    if (opts.d) out = [...text].filter(c => !inSet1(c)).join('');
    else if (set2 && !(opts.s && operands.length === 1)) {
      const map = new Map();
      if (opts.c || opts.C) for (const c of new Set(text)) { if (!set1.includes(c)) map.set(c, set2.at(-1)); }
      else set1.forEach((c, i) => map.set(c, set2[Math.min(i, set2.length - 1)]));
      out = [...text].map(c => map.get(c) ?? c).join('');
    } else out = text;
    const squeeze = opts.s ? new Set(set2 && !opts.d ? set2 : set2 ?? set1) : null;
    if (squeeze) out = [...out].filter((c, i, all) => !(i && c === all[i - 1] && squeeze.has(c))).join('');
    return { out, err: '', status: 0 };
  },
  diff(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'uqiwB', '', { unified: 'u', brief: 'q' });
    if (error) return { out: '', err: `diff: ${error}\ndiff: Try 'diff --help' for more information.\n`, status: 2 };
    if (operands.length < 2) return { out: '', err: `diff: missing operand after '${operands[0] ?? 'diff'}'\ndiff: Try 'diff --help' for more information.\n`, status: 2 };
    if (operands.length > 2) return { out: '', err: `diff: extra operand '${operands[2]}'\ndiff: Try 'diff --help' for more information.\n`, status: 2 };
    const texts = operands.map(file => file === '-' ? ctx.readStdin(stdin) : ctx.files[file]);
    const gone = operands.find((_, i) => texts[i] === undefined);
    if (gone) return { out: '', err: `diff: ${gone}: No such file or directory\n`, status: 2 };
    const [a, b] = texts.map(lines);
    const norm = line => { const squeezed = opts.w ? line.replace(/\s+/g, '') : line; return opts.i ? squeezed.toLowerCase() : squeezed; };
    const changes = hunks(a.map(norm), b.map(norm));
    if (!changes.length) return { out: '', err: '', status: 0 };
    if (opts.q) return { out: `Files ${operands[0]} and ${operands[1]} differ\n`, err: '', status: 1 };
    const out = [];
    const range = (from, to) => to - from > 1 ? `${from + 1},${to}` : `${to - from === 1 ? from + 1 : from}`;
    if (opts.u) {
      out.push(`--- ${operands[0]}\t2026-10-02 15:00:00.000000000 +1000`, `+++ ${operands[1]}\t2026-10-02 15:10:00.000000000 +1000`);
      // Changes within six lines of each other share a hunk, with three lines of context around.
      const groups = [];
      for (const change of changes) {
        const last = groups.at(-1);
        if (last && change[0] - last.at(-1)[1] <= 6) last.push(change); else groups.push([change]);
      }
      for (const group of groups) {
        const aFrom = Math.max(0, group[0][0] - 3), aTo = Math.min(a.length, group.at(-1)[1] + 3);
        const bFrom = Math.max(0, group[0][2] - 3), bTo = Math.min(b.length, group.at(-1)[3] + 3);
        const span = (from, to) => to - from === 1 ? `${from + 1}` : `${to - from ? from + 1 : from},${to - from}`;
        out.push(`@@ -${span(aFrom, aTo)} +${span(bFrom, bTo)} @@`);
        let i = aFrom;
        for (const [a0, a1, b0, b1] of group) {
          for (; i < a0; i++) out.push(` ${a[i]}`);
          for (let k = a0; k < a1; k++) out.push(`-${a[k]}`);
          for (let k = b0; k < b1; k++) out.push(`+${b[k]}`);
          i = a1;
        }
        for (; i < aTo; i++) out.push(` ${a[i]}`);
      }
    } else {
      for (const [a0, a1, b0, b1] of changes) {
        const kind = a1 === a0 ? 'a' : b1 === b0 ? 'd' : 'c';
        out.push(`${range(a0, a1)}${kind}${range(b0, b1)}`);
        for (let k = a0; k < a1; k++) out.push(`< ${a[k]}`);
        if (kind === 'c') out.push('---');
        for (let k = b0; k < b1; k++) out.push(`> ${b[k]}`);
      }
    }
    return { out: joined(out), err: '', status: 1 };
  },
  echo(args) {
    let newline = true, escapes = false, i = 0;
    for (; i < args.length && /^-[neE]+$/.test(args[i]); i++) {
      if (args[i].includes('n')) newline = false;
      if (args[i].includes('e')) escapes = true;
    }
    let text = args.slice(i).join(' ');
    if (escapes) text = text.replace(/\\([ntr\\])/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\' })[c]);
    return { out: text + (newline ? '\n' : ''), err: '', status: 0 };
  },
  tee(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'ai', '', { append: 'a' });
    if (error) return fail('tee', error);
    const text = ctx.readStdin(stdin);
    for (const file of operands) ctx.write(file, text, opts.a);
    return { out: text, err: '', status: 0 };
  },
  rev(args, stdin, ctx) {
    const { read, err, status } = inputs('rev', args, stdin, ctx);
    return { out: joined(read.flatMap(input => lines(input.text)).map(line => [...line].reverse().join(''))), err, status };
  },
  tac(args, stdin, ctx) {
    const { read, err, status } = inputs('tac', args, stdin, ctx);
    return { out: read.map(input => joined(lines(input.text).reverse())).join(''), err, status };
  },
  nl(args, stdin, ctx) {
    const { read, err, status } = inputs('nl', args.filter(a => !a.startsWith('-')), stdin, ctx);
    let n = 0;
    return { out: joined(read.flatMap(input => lines(input.text)).map(line => line.trim() ? `${pad(++n, 6)}\t${line}` : '')), err, status };
  },
  seq(args) {
    const nums = args.map(Number);
    if (!args.length || nums.some(Number.isNaN)) return fail('seq', args.length ? `invalid floating point argument: '${args.find(a => Number.isNaN(Number(a)))}'` : 'missing operand');
    const [first, step, last] = nums.length === 1 ? [1, 1, nums[0]] : nums.length === 2 ? [nums[0], 1, nums[1]] : nums;
    const out = [];
    for (let n = first; step > 0 ? n <= last : n >= last; n += step) { out.push(n); if (out.length > 100000 || !step) break; }
    return { out: joined(out), err: '', status: 0 };
  },
  yes(args, stdin, ctx) {
    const line = args.length ? args.join(' ') : 'y';
    ctx.note('endless', 'yes never stops. Here it stops after 1,000 lines; in a real terminal press Ctrl-C.');
    return { out: joined(Array(1000).fill(line)), err: '', status: 0 };
  },
  sed(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, 'nEr', 'e', { quiet: 'n', 'regexp-extended': 'E', expression: 'e' });
    if (error) return fail('sed', error);
    const script = opts['e*']?.join('\n') ?? operands.shift();
    if (script === undefined) return { out: '', err: 'Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...\n', status: 1 };
    let program;
    try { program = sedProgram(script, !!(opts.E || opts.r)); } catch (e) { return { out: '', err: `sed: -e expression #1, char ${script.length}: ${e.message}\n`, status: 1 }; }
    const { read, err, status } = inputs('sed', operands, stdin, ctx);
    const all = read.flatMap(input => lines(input.text)), out = [];
    lineLoop: for (let n = 0; n < all.length; n++) {
      let line = all[n];
      for (const cmd of program) {
        const at = cmd.address;
        if (at && !(at.line ? at.line === n + 1 : at.last ? n === all.length - 1 : (at.re.lastIndex = 0, at.re.test(line)))) continue;
        if (cmd.op === 'd') continue lineLoop;
        if (cmd.op === 'p') out.push(line);
        if (cmd.op === 's') {
          cmd.re.lastIndex = 0;
          const before = line;
          line = line.replace(cmd.re, (...m) => cmd.replacement.replace(/\\(\d)|&|\\&|\\n/g, token => token === '&' ? m[0] : token === '\\&' ? '&' : token === '\\n' ? '\n' : m[Number(token[1])] ?? ''));
          if (cmd.print && line !== before) out.push(line);
        }
        if (cmd.op === 'q') { if (!opts.n) out.push(line); break lineLoop; }
      }
      if (!opts.n) out.push(line);
    }
    return { out: joined(out), err, status };
  },
  awk(args, stdin, ctx) {
    const { opts, operands, error } = getopt(args, '', 'Fv');
    if (error) return fail('awk', error, 2, false);
    const source = operands.shift();
    if (source === undefined) return { out: '', err: "usage: awk [-F fs] 'program' [file ...]\n", status: 2 };
    let program;
    try { program = awkProgram(source); } catch { return { out: '', err: "awk: this sandbox's awk only runs simple programs such as '{print $1, $3}' or '/re/ {print $2}'.\n", status: 2 }; }
    const { read, err, status } = inputs('awk', operands, stdin, ctx);
    const out = [];
    read.flatMap(input => lines(input.text)).forEach((line, i) => {
      const fields = opts.F ? line.split(opts.F === 't' ? '\t' : opts.F) : line.trim().split(/\s+/).filter(Boolean);
      const value = token => token === '$0' ? line : token === 'NR' ? String(i + 1) : token === 'NF' ? String(fields.length) : token === '$NF' ? fields.at(-1) ?? '' : token.startsWith('$') ? fields[Number(token.slice(1)) - 1] ?? '' : token.startsWith('"') ? token.slice(1, -1).replace(/\\t/g, '\t').replace(/\\n/g, '\n') : '';
      for (const rule of program) {
        if (rule.re) { rule.re.lastIndex = 0; if (!rule.re.test(line)) continue; }
        if (rule.nr && rule.nr !== i + 1) continue;
        if (rule.field && value(rule.field[0]) !== rule.field[1]) continue;
        out.push(rule.print ? rule.print.map(group => group.map(value).join('')).join(' ') : line);
      }
    });
    return { out: joined(out), err, status };
  },
  man(args) {
    if (!args.length) return { out: '', err: 'What manual page do you want?\nFor example, try \'man man\'.\n', status: 1 };
    const page = manPage(args[0]);
    return page ? { out: page, err: '', status: 0 } : { out: '', err: `No manual entry for ${args[0]}\n`, status: 16 };
  },
  pwd: () => ({ out: '/home/you/case\n', err: '', status: 0 }),
  whoami: () => ({ out: 'you\n', err: '', status: 0 }),
  date: () => ({ out: 'Fri Oct  2 15:30:00 AEST 2026\n', err: '', status: 0 }),
  true: () => ({ out: '', err: '', status: 0 }),
  false: () => ({ out: '', err: '', status: 1 }),
  sleep: () => ({ out: '', err: '', status: 0 }),
  clear: () => ({ out: '', err: '', status: 0 }),
  cd: () => ({ out: '', err: '', status: 0 }),
};
commands.less = commands.more = (args, stdin, ctx) => commands.cat(args.filter(a => !a.startsWith('-')), stdin, ctx);
commands.egrep = (args, stdin, ctx) => commands.grep(['-E', ...args], stdin, ctx);
commands.fgrep = (args, stdin, ctx) => commands.grep(['-F', ...args], stdin, ctx);

// head and tail share their options: -n N, -N, -c N, and tail's -n +N.
function ends(name, args, stdin, ctx) {
  const shorthand = args.map(arg => /^-\d+$/.test(arg) ? `-n${arg.slice(1)}` : arg);
  const { opts, operands, error } = getopt(shorthand, 'qvfF', 'nc', { lines: 'n', bytes: 'c' });
  if (error) return fail(name, error);
  const spec = String(opts.c ?? opts.n ?? '10');
  if (!/^[+-]?\d+$/.test(spec)) return fail(name, `invalid number of ${opts.c ? 'bytes' : 'lines'}: '${spec}'`, 1, false);
  const n = Math.abs(Number(spec)), from = spec.startsWith('+'), allBut = spec.startsWith('-');
  const { read, err, status } = inputs(name, operands, stdin, ctx);
  const pick = list => name === 'head' ? (allBut ? list.slice(0, Math.max(0, list.length - n)) : list.slice(0, n)) : from ? list.slice(Math.max(0, n - 1)) : n ? list.slice(-n) : [];
  const out = read.map(({ file, text }, i) => {
    const body = opts.c ? pick([...text]).join('') : joined(pick(lines(text)));
    return read.length > 1 && !opts.q ? `${i ? '\n' : ''}==> ${file === '-' ? 'standard input' : file} <==\n${body}` : body;
  }).join('');
  if (opts.f) ctx.note('follow', 'tail -f keeps watching for new lines until you press Ctrl-C. Here nothing more arrives.');
  return { out, err, status };
}

function sedProgram(script, extended) {
  const program = [];
  let i = 0;
  const read = delimiter => {
    let text = '';
    while (i < script.length && script[i] !== delimiter) {
      if (script[i] === '\\' && script[i + 1] === delimiter) { text += delimiter; i += 2; continue; }
      if (script[i] === '\\') { text += script[i] + (script[i + 1] ?? ''); i += 2; continue; }
      text += script[i++];
    }
    if (script[i] !== delimiter) throw new Error(`unterminated \`s' command`);
    i++;
    return text;
  };
  while (i < script.length) {
    while (/[\s;]/.test(script[i] ?? '')) i++;
    if (i >= script.length) break;
    let address = null;
    const num = script.slice(i).match(/^\d+/);
    if (num) { address = { line: Number(num[0]) }; i += num[0].length; }
    else if (script[i] === '$') { address = { last: true }; i++; }
    else if (script[i] === '/') { i++; address = { re: regex(read('/'), { extended }) }; }
    const op = script[i++];
    if (op === 's') {
      const delimiter = script[i++];
      const pattern = read(delimiter), replacement = read(delimiter);
      const flags = script.slice(i).match(/^[gip0-9]*/)[0];
      i += flags.length;
      program.push({ address, op, re: regex(pattern, { extended, ignoreCase: flags.includes('i'), global: flags.includes('g') }), replacement, print: flags.includes('p') });
    } else if ('dpq'.includes(op)) program.push({ address, op });
    else throw new Error(`unknown command: \`${op}'`);
  }
  return program;
}

// awk, cut down to rules of an optional /re/, NR==n or $n=="x", then {print …} or nothing.
function awkProgram(source) {
  const rules = [];
  const rule = /\s*(?:\/((?:\\.|[^/])*)\/|NR\s*==\s*(\d+)|(\$\d+|\$NF)\s*==\s*"([^"]*)")?\s*(?:\{\s*(print(?:\s+[^}]*)?)?\s*;?\s*\})?\s*/y;
  while (rule.lastIndex < source.length) {
    const at = rule.lastIndex, m = rule.exec(source);
    if (!m || rule.lastIndex === at) throw new Error('unsupported');
    const [, re, nr, field, value, print] = m;
    let items = null;
    if (print && print.trim() !== 'print') {
      items = print.slice(5).trim().split(/\s*,\s*/).map(item => item.match(/\$\d+|\$NF|\$0|NR|NF|"[^"]*"/g) ?? []);
      if (items.some(group => !group.length)) throw new Error('unsupported');
    }
    rules.push({ re: re !== undefined ? regex(re, { extended: true }) : null, nr: nr && Number(nr), field: field && [field, value], print: items });
  }
  if (!rules.length) throw new Error('unsupported');
  return rules;
}

// Globs, matched against the pretend files: * ? and [abc].
function expand(word, files) {
  const re = new RegExp(`^${word.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
  const hits = Object.keys(files).filter(name => re.test(name) && (word.startsWith('.') || !name.startsWith('.'))).sort();
  return hits.length ? hits : [word];
}

// Runs a parsed command line on a copy of files. Returns what reached the terminal, as chunks of
// { fd, text } in the order they were written, the files afterwards, which ones were written, and
// notes on anything the sandbox did differently from a real terminal.
export function run(model, files, { platform = 'linux' } = {}) {
  const fs = { ...files };
  const terminal = [], written = new Map(), notes = new Map(), buffers = new Map();
  const shell = platform === 'macos' ? 'zsh' : 'bash';
  const write = (dest, text) => {
    if (!text || !dest) return;
    if (dest.type === 'multio') return dest.targets.forEach(target => write(target, text));
    if (dest.type === 'terminal') {
      if (dest.id === 'terminal-in') return;
      const fd = dest.id === 'terminal-err' ? 2 : 1, last = terminal.at(-1);
      if (last?.fd === fd) last.text += text; else terminal.push({ fd, text });
    } else if (dest.type === 'file') {
      fs[dest.label] = (fs[dest.label] ?? '') + text;
      written.set(dest.label, true);
    } else if (dest.type === 'pipe') buffers.set(dest.id, (buffers.get(dest.id) ?? '') + text);
  };
  let status = 0;
  for (const pipeline of model.pipelines) {
    if ((pipeline.operator === '&&' && status !== 0) || (pipeline.operator === '||' && status === 0)) continue;
    if (pipeline.substitutions.length) {
      notes.set('procsub', 'Process substitutions and parallel jobs aren’t run in this sandbox. Try them in a real terminal.');
      status = 1;
      continue;
    }
    buffers.clear();
    // The shell opens every file a pipeline writes to before any command runs, so `sort f > f`
    // finds f already empty.
    const opened = new Set();
    for (const cmd of pipeline.commands) for (const dest of Object.values(cmd.fds)) {
      for (const target of dest?.type === 'multio' ? dest.targets : [dest]) {
        if (target?.type !== 'file' || opened.has(target.label)) continue;
        opened.add(target.label);
        if (target.mode === 'write') fs[target.label] = '';
        else if (target.mode === 'append') fs[target.label] ??= '';
        if (target.mode !== 'read') written.set(target.label, true);
      }
    }
    for (const cmd of pipeline.commands) {
      const input = cmd.fds[0];
      let stdin = '';
      const readable = target => target?.type === 'file' ? fs[target.label] : target?.type === 'pipe' ? buffers.get(target.id) : undefined;
      if (input?.type === 'file' && fs[input.label] === undefined) {
        write(cmd.fds[2], `${shell}: ${input.label}: No such file or directory\n`);
        status = 1;
        continue;
      }
      stdin = readable(input) ?? '';
      const name = cmd.args[0];
      const args = cmd.args.slice(1).flatMap((arg, i) => cmd.globs?.[i + 1] ? expand(arg, fs) : [arg]);
      const tool = commands[name];
      if (!tool) {
        write(cmd.fds[2], platform === 'macos' ? `zsh: command not found: ${name}\n` : `bash: ${name}: command not found\n`);
        status = 127;
        continue;
      }
      const ctx = {
        files: fs, platform,
        tty: cmd.fds[1]?.type === 'terminal',
        // A command that reads stdin from the terminal would sit waiting for the keyboard.
        readStdin: () => {
          if (input?.type === 'terminal') notes.set(`keyboard-${cmd.key}`, `${name} is reading the keyboard. In a real terminal it would wait for you to type, until you press Ctrl-D (or Ctrl-C to give up). Give it a file, or pipe something in.`);
          return stdin;
        },
        write: (file, text, append) => { fs[file] = (append ? fs[file] ?? '' : '') + text; written.set(file, true); },
        note: (key, text) => notes.set(key, text),
      };
      let result;
      try { result = tool(args, stdin, ctx); } catch (error) { result = { out: '', err: `${name}: ${error.message}\n`, status: 2 }; }
      write(cmd.fds[2], result.err.slice(0, MAX));
      write(cmd.fds[1], result.out.slice(0, MAX));
      status = result.status;
    }
  }
  return { terminal, files: fs, written: [...written.keys()].filter(file => !(file in files) || fs[file] !== files[file]), notes: [...notes.values()], status };
}

// What reached the terminal, as lines tagged with their stream.
export function screenLines(result) {
  return result.terminal.flatMap(({ fd, text }) => lines(text).map(line => ({ fd, text: line })));
}

// Lines match when they hold the same words: column padding, which differs between GNU and BSD
// tools, doesn't count.
export const sameLine = (a, b) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

export const known = Object.keys(commands);
