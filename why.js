// Why Unix?: two short films on the big ideas, then the same ideas tried out on a pretend server, one
// step of an investigation at a time. Each step's kicker gets a tick, which is saved, once the student
// has done its one thing.
import { playScenes } from './whyscenes.js';
import { ATTACKER, VISITORS, BAG, HOME, BLOCKLIST, SCRIPT, FS, LOG, ctx, read, rng, two, logLine, runLine, watchers } from './whyshell.js';

const $ = selector => document.querySelector(selector);
const SESSION = 'pipeviewer-whyunix-session';
const sections = [...document.querySelectorAll('#why-page .why-step')].map(section => section.id);
let done = new Set();
try { done = new Set(JSON.parse(localStorage.getItem(SESSION))?.done ?? []); } catch {}
function finish(id) {
  if (done.has(id)) return;
  done.add(id);
  document.getElementById(id).classList.add('done');
  try { localStorage.setItem(SESSION, JSON.stringify({ done: [...done], of: sections.length })); } catch {}
}
done.forEach(id => document.getElementById(id)?.classList.add('done'));

/* ---------- terminals ---------- */
const terms = {};
function Terminal(root, { prefill = '', nudge = false, ran } = {}) {
  root.classList.add('term');
  root.innerHTML = '<div class="scroll"><div class="out" aria-live="polite"></div><label class="line"><span class="ps1"></span><input spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command"><kbd class="enter">⏎</kbd></label></div>';
  const out = root.querySelector('.out'), input = root.querySelector('input'), scroll = root.querySelector('.scroll'), ps1 = root.querySelector('.ps1'), line = root.querySelector('.line');
  const prompt = () => (ctx.cwd.startsWith(HOME) ? '~' + ctx.cwd.slice(HOME.length) : ctx.cwd) + ' $';
  const history = []; let back = 0;
  const sync = () => line.classList.toggle('has', input.value.trim() !== '');
  // Long output is cut short; a package manager's output arrives a line at a time.
  function print(lines, kind, slow) {
    const MAX = 80, frag = document.createDocumentFragment();
    lines.slice(0, MAX).forEach((text, i) => {
      const div = document.createElement('div');
      div.className = [kind, slow && 'slow'].filter(Boolean).join(' ');
      if (slow) div.style.animationDelay = `${i * 110}ms`;
      div.textContent = text;
      frag.append(div);
    });
    if (lines.length > MAX) { const div = document.createElement('div'); div.className = 'more'; div.textContent = `… ${(lines.length - MAX).toLocaleString()} more lines`; frag.append(div); }
    out.append(frag);
  }
  function run(command) {
    const echo = document.createElement('div'), p = document.createElement('span');
    echo.className = 'echo'; p.className = 'ps1'; p.textContent = prompt();
    echo.append(p, ' ' + command); out.append(echo);
    if (command.trim()) history.push(command);
    back = history.length;
    const r = runLine(command);
    if (r.clear) out.textContent = '';
    else { print(r.out, '', r.slow); print(r.err, 'err'); }
    ps1.textContent = prompt(); line.classList.remove('nudge'); sync();
    scroll.scrollTop = scroll.scrollHeight;
    ran?.(command, r);
  }
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { const command = input.value; input.value = ''; run(command); }
    else if (event.key === 'ArrowUp' && back > 0) { input.value = history[--back]; event.preventDefault(); sync(); }
    else if (event.key === 'ArrowDown' && back < history.length) { back++; input.value = history[back] ?? ''; event.preventDefault(); sync(); }
  });
  input.addEventListener('input', sync);
  root.addEventListener('click', () => { if (!getSelection().toString()) input.focus({ preventScroll: true }); });
  ps1.textContent = prompt(); input.value = prefill; line.classList.toggle('nudge', nudge); sync();
  return { run, input };
}
$('#why-page').addEventListener('click', event => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  const term = terms[chip.parentElement.dataset.for];
  term.run(chip.textContent);
  term.input.focus({ preventScroll: true });
});

/* ---------- pipelines ---------- */
const lines = n => n.toLocaleString() + (n === 1 ? ' line' : ' lines');
// The pipe narrows with the square root of the lines in it, so a filter visibly thins the stream.
const pipeWidth = n => n ? (3 + 22 * Math.sqrt(n / 2000)).toFixed(1) + 'px' : '2px';
function streams(commands) { const s = [LOG]; for (const command of commands) s.push(runLine(command, 0, s.at(-1)).out); return s; }
function joint(i, n) {
  const b = document.createElement('button');
  b.className = 'joint' + (n ? '' : ' empty'); b.dataset.i = i;
  b.style.setProperty('--w', pipeWidth(n));
  b.innerHTML = '<span class="pipe"></span><span class="n"></span>';
  b.lastChild.textContent = lines(n);
  b.setAttribute('aria-label', `${lines(n)} flowing here; show them`);
  return b;
}
function showPaper(el, text, mark) {
  const MAX = 60, pre = document.createElement('pre');
  for (const line of text.slice(0, MAX)) { const div = document.createElement('div'); div.textContent = line || ' '; if (mark?.(line)) div.className = 'hit'; pre.append(div); }
  el.replaceChildren(pre);
  if (text.length > MAX) { const foot = document.createElement('div'); foot.className = 'foot'; foot.textContent = `… ${(text.length - MAX).toLocaleString()} more`; el.append(foot); }
  el.scrollTop = 0;
}
// Pointing at a pipe, or tabbing to it, shows what flows through it, like a browser's inspector.
function inspectable(chain, show) {
  const pick = i => { chain.querySelectorAll('.joint').forEach(j => j.classList.toggle('on', i !== null && +j.dataset.i === i)); show(i); };
  chain.addEventListener('pointerover', event => { const j = event.target.closest('.joint'); if (j) pick(+j.dataset.i); });
  chain.addEventListener('pointerleave', () => pick(null));
  chain.addEventListener('focusin', event => { const j = event.target.closest('.joint'); if (j) pick(+j.dataset.i); });
  chain.addEventListener('focusout', () => pick(null));
}

/* ---------- small tools, joined by text ---------- */
{
  const T = { sortn: { command: 'sort -rn', says: 'biggest number first' }, cut: { command: "cut -d' ' -f1", says: 'keep column 1, the address' }, head: { command: 'head -3', says: 'keep the top 3' },
    uniq: { command: 'uniq -c', says: 'count repeats' }, grep: { command: "grep ' 401 '", says: 'keep failed logins' }, sort: { command: 'sort', says: 'put in order' } };
  const ORDER = ['sortn', 'cut', 'head', 'uniq', 'grep', 'sort'], RIGHT = ['grep', 'cut', 'sort', 'uniq', 'sortn', 'head'];
  const ANSWER = streams(RIGHT.map(k => T[k].command)).at(-1).join('\n');
  const section = $('#why-look'), tray = $('#why-tray'), chainEl = $('#why-chain'), cmd = $('#why-cmd'), out = $('#why-out'), verdict = $('#why-verdict');
  $('#why-nlines').textContent = LOG.length.toLocaleString();
  let chain = [], S = [], solved = false, fresh = null;
  const mark = line => solved && line.includes(ATTACKER);
  function render() {
    S = streams(chain.map(k => T[k].command));
    tray.replaceChildren(...ORDER.filter(k => !chain.includes(k)).map(k => {
      const b = document.createElement('button'); b.className = 'tool'; b.dataset.k = k;
      b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = T[k].command; b.lastChild.textContent = T[k].says;
      return b;
    }));
    tray.classList.toggle('idle', chain.length === 0);
    const source = document.createElement('div'); source.className = 'tool src'; source.textContent = 'cat access.log';
    const nodes = [source, joint(0, S[0].length)];
    chain.forEach((k, i) => {
      const b = document.createElement('button'); b.className = 'tool' + (k === fresh ? ' in' : ''); b.dataset.k = k; b.textContent = T[k].command;
      b.setAttribute('aria-label', `Remove ${T[k].command}`);
      nodes.push(b, joint(i + 1, S[i + 1].length));
    });
    chainEl.replaceChildren(...nodes);
    const typed = document.createElement('b'); typed.textContent = '$ cat access.log';
    cmd.replaceChildren(typed, ...chain.map(k => ' | ' + T[k].command));
    solved = S.at(-1).join('\n') === ANSWER;
    section.classList.toggle('cracked', solved);
    if (solved) { const [n, ip] = S.at(-1)[0].trim().split(/\s+/); verdict.textContent = `${ip}: ${n} failed logins, all between 1 and 2 am.`; finish('why-look'); }
    showPaper(out, S.at(-1), mark);
    fresh = null;
  }
  tray.addEventListener('click', event => {
    const b = event.target.closest('.tool'); if (!b) return;
    fresh = b.dataset.k; chain.push(b.dataset.k); render();
    tray.querySelector('.tool')?.focus({ preventScroll: true });
  });
  chainEl.addEventListener('click', event => { const b = event.target.closest('button.tool'); if (b) { chain = chain.filter(k => k !== b.dataset.k); render(); } });
  inspectable(chainEl, i => showPaper(out, i === null ? S.at(-1) : S[i], mark));
  render();

  // The app beside it can filter and sort, but not count.
  const viewer = $('#why-viewer'), tbody = viewer.querySelector('tbody'), status = viewer.querySelector('.st'), filter = viewer.querySelector('input');
  const ROWS = LOG.map(line => { const m = line.match(/^(\S+) \S+ \S+ \[[^:]+:(\S+) [^\]]+\] "([^"]*)" (\d+)/); return [m[1], m[2], m[3], m[4], line.toLowerCase()]; });
  const headings = [...viewer.querySelectorAll('th')].map(th => th.textContent);
  let key = null, dir = 1;
  function table() {
    const f = filter.value.toLowerCase(), rows = f ? ROWS.filter(r => r[4].includes(f)) : ROWS.slice();
    if (key !== null) rows.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * dir);
    const frag = document.createDocumentFragment();
    for (const r of rows.slice(0, 300)) { const tr = document.createElement('tr'); for (let i = 0; i < 4; i++) { const td = document.createElement('td'); td.textContent = r[i]; tr.append(td); } frag.append(tr); }
    tbody.replaceChildren(frag);
    status.textContent = `${rows.length.toLocaleString()} of ${ROWS.length.toLocaleString()} rows`;
    viewer.querySelectorAll('th').forEach((th, i) => { th.textContent = headings[i] + (i === key ? (dir > 0 ? ' ▲' : ' ▼') : ''); });
  }
  filter.addEventListener('input', table);
  viewer.querySelector('thead').addEventListener('click', event => { const th = event.target.closest('th'); if (!th) return; const k = +th.dataset.k; dir = key === k ? -dir : 1; key = k; table(); });
  table();
}

/* ---------- everything is a file ---------- */
{
  const section = $('#why-files'), tree = $('#why-tree');
  const groups = [['/etc', ['hostname', 'timezone', 'passwd', 'nginx/blocklist.conf']], ['/proc', ['uptime', 'loadavg', 'meminfo']], ['~', ['access.log', 'mon.log']]];
  const kind = path => path.startsWith('/proc') ? 'live' : path.endsWith('.log') ? 'log' : '';
  for (const [dir, names] of groups) {
    const heading = document.createElement('div'); heading.className = 'dir'; heading.textContent = dir + '/'; tree.append(heading);
    for (const name of names) {
      const b = document.createElement('button'), path = `${dir}/${name}`;
      b.dataset.p = path; b.innerHTML = '<b></b><span></span>'; b.firstChild.style.fontWeight = 400;
      b.firstChild.textContent = name; b.lastChild.textContent = kind(path);
      tree.append(b);
    }
  }
  const term = terms['t-files'] = Terminal($('#t-files'), { prefill: `echo "deny ${ATTACKER};" >> ${BLOCKLIST}`, nudge: true });
  tree.addEventListener('click', event => { const b = event.target.closest('button'); if (b) term.run((b.dataset.p.endsWith('.log') ? 'head -5 ' : 'cat ') + b.dataset.p); });
  watchers.add(path => {
    const b = tree.querySelector(`[data-p="${path}"]`);
    if (b) { b.classList.remove('changed'); void b.offsetWidth; b.classList.add('changed'); }
  });

  // The web server reads the block list, so once the address is in it the attacker's requests are refused.
  const blocked = () => (read(BLOCKLIST) || []).some(line => new RegExp(`^\\s*deny\\s+${ATTACKER.replace(/\./g, '\\.')}\\s*;`).test(line));
  const pre = $('#why-tail pre'), rate = $('#why-rate'), r = rng(99), tries = [];
  let tick = 0, visible = false;
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(section);
  function step(force) {
    if (!force && (!visible || document.hidden)) return;
    tick++;
    const now = new Date(), t = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(), date = two(now.getDate()), refused = blocked();
    section.classList.toggle('blocked', refused);
    if (refused) finish('why-files');
    let line, kind = '';
    if (r() < .45) { line = logLine(ATTACKER, date, t, 'POST', '/login', refused ? 403 : 401, refused ? 162 : 512); kind = refused ? 'gone' : 'hit'; if (!refused) tries.push(tick); }
    else { const [method, path, status] = BAG[Math.floor(r() * BAG.length)]; line = logLine(VISITORS[Math.floor(r() * VISITORS.length)], date, t, method, path, status, 300 + Math.floor(r() * 9000)); }
    while (tries.length && tries[0] < tick - 40) tries.shift();
    rate.textContent = refused ? `${ATTACKER} refused` : `${ATTACKER} · ${Math.round(tries.length * 60 / (40 * .7))} tries/min`;
    const div = document.createElement('div'); div.textContent = line; if (kind) div.className = kind; pre.append(div);
    while (pre.children.length > 9) pre.firstChild.remove();
  }
  for (let i = 0; i < 9; i++) step(true);
  setInterval(step, 700);

  const steps = ['Windows Security', 'Firewall & network protection', 'Advanced settings', 'Inbound Rules', 'New Rule…', 'Rule Type: Custom', 'Scope: remote IP addresses', 'Action: Block the connection'];
  $('#why-stack').append(...steps.map((text, i) => { const div = document.createElement('div'); div.textContent = text; div.style.left = i * 4 + 'px'; div.style.top = i * 20 + 'px'; return div; }));
}

/* ---------- what you type, you can keep ---------- */
{
  const file = $('#why-script');
  const PIPELINE = `grep ' 401 ' "$1" | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -3`;
  function render() {
    const saved = FS[SCRIPT] !== undefined, name = document.createElement('div'), pre = document.createElement('pre');
    file.classList.toggle('draft', !saved);
    name.className = 'name';
    if (!saved) {
      name.textContent = 'what you typed';
      pre.textContent = `cat access.log | grep ' 401 ' | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -3`;
      const save = document.createElement('button'); save.className = 'save'; save.textContent = 'Save as who-failed';
      save.addEventListener('click', () => {
        FS[SCRIPT] = ['#!/bin/sh', '# Who keeps failing to log in?  Usage: who-failed LOGFILE', PIPELINE];
        render(); terms['t-keep'].input.focus({ preventScroll: true });
      });
      file.replaceChildren(name, pre, save);
      return;
    }
    name.textContent = '~/bin/who-failed';
    for (const line of FS[SCRIPT]) {
      const div = document.createElement('div');
      if (line.startsWith('#')) { div.className = 'cmt'; div.textContent = line; }
      else line.split('"$1"').forEach((part, i) => { if (i) { const arg = document.createElement('span'); arg.className = 'arg'; arg.textContent = '"$1"'; div.append(arg); } div.append(part); });
      pre.append(div);
    }
    file.replaceChildren(name, pre);
  }
  render();
  terms['t-keep'] = Terminal($('#t-keep'), { ran: (command, r) => { if (/^who-failed\b/.test(command.trim()) && r.out.length) finish('why-keep'); } });
  terms['t-keep'].run('ls');
}

/* ---------- do one thing well ---------- */
{
  const chainEl = $('#why-chain2'), out = $('#why-out2'), question = $('#why-question');
  const SWAPS = {
    grep: [["grep ' 401 '", 'failed logins'], ["grep ' 404 '", '“not found” errors'], ["grep ' 200 '", 'successful requests']],
    cut: [["cut -d' ' -f1", 'visitors'], ["cut -d' ' -f7", 'pages']],
    end: [['head -3', 'most'], ['tail -3', 'fewest'], ['wc -l', 'count']],
  };
  const pick = { grep: 0, cut: 0, end: 0 }, blocks = ['cat access.log', 'grep', 'cut', 'sort', 'uniq -c', 'sort -rn', 'end'];
  let S = [], before = [];
  // The question in words, in parts, so the part a swap changes can light up.
  function sentence() {
    const what = SWAPS.grep[pick.grep][1], who = SWAPS.cut[pick.cut][1], end = SWAPS.end[pick.end][1];
    if (end === 'count') return [['How many different ', ''], [who, 'cut'], [' have ', ''], [what, 'grep'], ['?', '']];
    return [['Which 3 ', ''], [who, 'cut'], [' have the ', ''], [end, 'end'], [' ', ''], [what, 'grep'], ['?', '']];
  }
  chainEl.replaceChildren(...blocks.flatMap((block, i) => {
    let el;
    if (SWAPS[block]) {
      el = document.createElement('select'); el.className = 'tool'; el.dataset.k = block; el.setAttribute('aria-label', 'Swap this tool');
      SWAPS[block].forEach(([command], j) => { const o = document.createElement('option'); o.value = j; o.textContent = command; el.append(o); });
    } else { el = document.createElement('div'); el.className = 'tool' + (i === 0 ? ' src' : ''); el.textContent = block; }
    return [el, joint(i, 0)];
  }));
  function update() {
    S = streams(blocks.slice(1).map(block => SWAPS[block] ? SWAPS[block][pick[block]][0] : block));
    chainEl.querySelectorAll('.joint').forEach((j, i) => {
      const n = S[i].length;
      j.style.setProperty('--w', pipeWidth(n)); j.classList.toggle('empty', !n);
      j.lastChild.textContent = lines(n); j.setAttribute('aria-label', `${lines(n)} flowing here; show them`);
    });
    const parts = sentence();
    question.replaceChildren(...parts.map(([text, k]) => {
      const span = document.createElement('span'); span.textContent = text;
      if (k && before.length && !before.some(([t, bk]) => bk === k && t === text)) span.className = 'fresh';
      return span;
    }));
    before = parts;
    showPaper(out, S.at(-1));
  }
  update();
  chainEl.addEventListener('change', event => { pick[event.target.dataset.k] = +event.target.value; update(); finish('why-swap'); });
  inspectable(chainEl, i => showPaper(out, i === null ? S.at(-1) : S[i]));
}

/* ---------- one trusted place for software ---------- */
terms['t-install'] = Terminal($('#t-install'), { ran: (command, r) => { if (/^whois\b/.test(command.trim()) && r.out.length) finish('why-install'); } });

/* ---------- the catch ---------- */
terms['t-catch'] = Terminal($('#t-catch'), { ran: (command, r) => { if (command.trim() && r.out.length && !r.err.length) finish('why-catch'); } });

// The films play the first time they come into view.
export function showWhy() { playScenes(); }
