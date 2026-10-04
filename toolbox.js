// Toolbox: learn the shell's small tools by cracking a case in a pretend terminal. The terminal is
// the whole exercise. Commands run on Enter in the sandbox, and the case notebook beside it holds a
// few open questions, each ticked off when its answer turns up in the output, however the student
// got there. A pipeline's output carries an X-ray of its stages, so the student can see what each
// tool did to the text.
import { parsePipeline } from './parser.js';
import { run, screenLines, tools, known, splitLines } from './sandbox.js';
import { files as caseFiles, clues, mail } from './cases.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const prose = text => escape(text).replace(/`([^`]+)`/g, '<code>$1</code>');
const printable = text => text.replace(/\0/g, '').replace(/[\x01-\x08\x0b-\x1f\x7f-\xff]/g, '�');
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

// The session: what the student has typed, which is all that's saved, since replaying it rebuilds
// everything else; and, as it's replayed or typed, the clues found, the tools used and the nudges seen.
const SESSION = 'pipeviewer-toolbox-session';
let platform = 'linux';
try { platform = localStorage.getItem('pipeviewer-platform') === 'macos' ? 'macos' : /mac|iphone|ipad/i.test(navigator.platform) && !localStorage.getItem('pipeviewer-platform') ? 'macos' : 'linux'; } catch {}
const state = { history: [], found: new Set(), used: new Set(), nudges: {}, mailed: false, closed: false };
const files = () => {
  const all = { ...caseFiles };
  if (!state.mailed) delete all['found-in-bin.txt'];
  return all;
};
// Pipeviewer's course picker reads found and closed to show the student's progress.
const save = () => { try { localStorage.setItem(SESSION, JSON.stringify({ history: state.history.slice(-200), nudges: state.nudges, found: state.found.size, of: clues.length, closed: state.closed })); } catch {} };
const promptText = () => platform === 'macos' ? 'you@tearoom case %' : 'you@tearoom:~/case$';

// The scrollback.
const scrollback = $('#scrollback');
let entries = 0;
const stick = () => { scrollback.scrollTop = scrollback.scrollHeight; };
function system(html, kind = '') {
  scrollback.insertAdjacentHTML('beforeend', `<div class="sys ${kind}">${html}</div>`);
}
function welcome() {
  system('Welcome to <b>tearoom</b>, a pretend Linux machine. Nothing you type here touches your own computer.');
  system('You’ve been handed a case. The questions are in your case notes. Type a command and press <kbd>Enter</kbd>.');
}

const SCREEN = 200;
const stages = new Map();
// Runs one command line and adds it, with its output, to the scrollback.
function execute(source, { replay = false } = {}) {
  const id = ++entries, line = `<div class="cmdline"><span class="ps">${escape(promptText())}</span> <span class="typed">${escape(source)}</span></div>`;
  const trimmed = source.trim();
  if (trimmed) state.history.push(source);
  if (!replay) save();
  if (!trimmed) { scrollback.insertAdjacentHTML('beforeend', `<div class="entry">${line}</div>`); return; }
  // The shell's own commands.
  if (trimmed === 'clear') { scrollback.innerHTML = ''; return; }
  if (trimmed === 'history') return addEntry(line, `<pre class="out">${state.history.map((cmd, i) => `<span>${String(i + 1).padStart(5)}  ${escape(cmd)}</span>`).join('')}</pre>`);
  if (trimmed === 'help') return addEntry(line, help());
  let model;
  try { model = parsePipeline(source, { platform }); } catch (error) { return addEntry(line, `<p class="tutor">${escape(error.message.replace(/ to see your pipeline\.$/, '.'))}</p>`); }
  const result = run(model, files(), { platform, trace: true });
  const lines = screenLines(result);
  const text = lines.map(l => l.text).join('\n');
  const out = lines.slice(0, SCREEN).map(l => `<span class="fd-${l.fd}">${escape(printable(l.text)) || ' '}</span>`).join('');
  const notes = [...tutor(source, result, lines), ...result.notes.map(note => escape(note)), ...result.written.map(file => `Wrote <code>${escape(file)}</code>: ${plural(splitLines(result.files[file]).length, 'line')}.`)];
  const fresh = result.commands.filter(cmd => cmd.status === 0 && tools[cmd.name] && !state.used.has(cmd.name)).map(cmd => cmd.name);
  fresh.forEach(name => state.used.add(name));
  const pipeline = model.pipelines.length === 1 && model.pipelines[0].commands.length > 1;
  if (pipeline) stages.set(id, result.commands);
  addEntry(line,
    (pipeline ? xray(id, result.commands) : '') + (out ? `<pre class="out">${out}</pre>` : '')
    + notes.map(note => `<p class="tutor">${note}</p>`).join('')
    + newTools([...new Set(fresh)]));
  // Clues found by this output, then whatever follows from them.
  const before = state.found.size;
  for (const clue of clues) if (!state.found.has(clue.id) && (!clue.mail || state.mailed) && clue.found(text, result)) {
    state.found.add(clue.id);
    state.latest = clue.id;
    system(`<span class="tick">✓</span> Noted: <b>${escape(clue.question)}</b>`, 'noted');
  }
  if (state.found.has('most') && !state.mailed) {
    state.mailed = true;
    system(`<span class="mail-icon" aria-hidden="true">✉</span> <b>New mail from Facilities</b><br>${escape(mail)}<br><span class="signed">Facilities</span>`, 'mail');
  }
  if (state.found.size === clues.length && !state.closed) {
    state.closed = true;
    system(`<b>CASE CLOSED.</b> Jo Lee, Hydrology, four trips in eight minutes, and a note in the bin to prove it. Solved in ${plural(state.history.length, 'command')}, with ${plural(state.used.size, 'tool')}.`, 'closed');
  }
  if (state.found.size !== before || fresh.length) showNotebook();
  if (!replay && state.found.size !== before) save();
}
// One new tool gets its summary; several at once are listed together, with their cards in the notebook.
const newTools = names => !names.length ? '' : names.length === 1
  ? `<p class="new-tool"><span>New tool</span><code>${escape(names[0])}</code> ${escape(tools[names[0]].summary)}</p>`
  : `<p class="new-tool"><span>New tools</span>${names.map(name => `<code>${escape(name)}</code>`).join(' · ')}</p>`;
function addEntry(line, body) {
  scrollback.insertAdjacentHTML('beforeend', `<div class="entry">${line}${body}</div>`);
}

// The X-ray: one chip per stage of a pipeline, with how many lines it passed on. Clicking a chip
// shows what that stage wrote.
const short = text => text.length > 26 ? `${text.slice(0, 24)}…` : text;
function xray(id, commands) {
  return `<div class="xray" data-entry="${id}">${commands.map((cmd, i) => {
    const count = cmd.out === undefined ? null : splitLines(cmd.out).length;
    const trouble = cmd.err || (cmd.status !== 0 && cmd.status !== null) ? ' trouble' : '';
    return `${i ? '<span class="pipe" aria-hidden="true">|</span>' : ''}<button type="button" class="stage${trouble}" data-stage="${i}" aria-expanded="false" title="See what ${escape(cmd.name)} passed on"><code>${escape(short(cmd.command ?? cmd.name))}</code><span class="count">${count === null ? 'didn’t run' : plural(count, 'line')}</span></button>`;
  }).join('')}</div><pre class="peek" hidden></pre>`;
}
scrollback.addEventListener('click', event => {
  const chip = event.target.closest('.stage');
  if (!chip) return;
  const box = chip.closest('.xray'), peek = box.nextElementSibling, cmd = stages.get(Number(box.dataset.entry))?.[Number(chip.dataset.stage)];
  const open = chip.getAttribute('aria-expanded') === 'true';
  box.querySelectorAll('.stage').forEach(other => other.setAttribute('aria-expanded', 'false'));
  if (open || !cmd) { peek.hidden = true; return; }
  chip.setAttribute('aria-expanded', 'true');
  const lines = splitLines(cmd.out ?? ''), errors = splitLines(cmd.err ?? '');
  peek.innerHTML = `<span class="peek-head">${escape(cmd.command)} wrote ${plural(lines.length, 'line')}${errors.length ? `, and ${plural(errors.length, 'error')}` : ''}</span>`
    + errors.map(l => `<span class="fd-2">${escape(l)}</span>`).join('')
    + lines.slice(0, 40).map(l => `<span>${escape(printable(l)) || ' '}</span>`).join('')
    + (lines.length > 40 ? `<span class="peek-more">… ${plural(lines.length - 40, 'more line')}</span>` : '');
  peek.hidden = false;
});

// Notes on the slips everyone makes at first, under the error that comes of them. Typos are found
// by edit distance, counting two letters swapped, as in grpe, as one slip.
const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
};
const closest = (word, list) => list.map(item => [item, distance(word, item)]).filter(([item, d]) => d <= Math.max(1, Math.floor(item.length / 4))).sort((x, y) => x[1] - y[1])[0]?.[0];
function tutor(source, result, lines) {
  const notes = [], errors = lines.filter(l => l.fd === 2).map(l => l.text).join('\n'), names = Object.keys(files());
  for (const cmd of result.commands) {
    if (cmd.status !== 127) continue;
    const guess = closest(cmd.name, known);
    notes.push(guess ? `There’s no <code>${escape(cmd.name)}</code>. Did you mean <code>${escape(guess)}</code>?` : `This pretend machine doesn’t have <code>${escape(cmd.name)}</code>. Type <code>help</code> to see what it has.`);
  }
  for (const [, file] of errors.matchAll(/(?:^|\n)(?:[\w-]+: )+(?:cannot access '|cannot stat ')?([^:'\n]+)'?: No such file or directory/g)) {
    const same = names.find(name => name.toLowerCase() === file.toLowerCase()), near = closest(file, names);
    if (same) notes.push(`File names care about capitals: this one is <code>${escape(same)}</code>.`);
    else if (near) notes.push(`There’s no <code>${escape(file)}</code>. Did you mean <code>${escape(near)}</code>?`);
  }
  if (/illegal option -- -$/m.test(errors) && /--help\b/.test(source)) notes.push('The BSD tools on macOS have no <code>--help</code>. Try <code>man</code> and the tool’s name instead, as in <code>man grep</code>, or switch to bash for the GNU tools.');
  if (/^tr: extra operand/m.test(errors)) notes.push('<code>tr</code> reads only stdin, never a file name. Feed it the file with <code>&lt; file</code>, or pipe it in with <code>cat file |</code>.');
  if (lines.length > SCREEN) notes.push(`That’s ${plural(lines.length, 'line')}, too many to read; here are the first ${SCREEN}. Try <code>head</code> to see the start, or <code>| wc -l</code> to count them.`);
  return notes;
}

function help() {
  const list = ['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'sort', 'uniq', 'cut', 'tr', 'diff', 'comm', 'sed', 'awk', 'tee', 'echo', 'printf', 'rev', 'tac', 'nl', 'seq', 'man'];
  const width = Math.max(...list.map(name => name.length));
  return `<pre class="out">${list.map(name => `<span><b class="${state.used.has(name) ? 'used' : ''}">${escape(name.padEnd(width))}</b>  ${escape(tools[name]?.summary ?? '')}</span>`).join('')}</pre><p class="tutor">Join them with <code>|</code>. For more on one, type <code>man</code> and its name, as in <code>man grep</code>.</p>`;
}

// The case notebook. The first open question shows its nudges, one at a time, on request.
function showNotebook() {
  const current = clues.find(clue => !state.found.has(clue.id) && (!clue.mail || state.mailed));
  $('#tally').textContent = `${state.found.size} / ${clues.length}`;
  $('#clues').innerHTML = clues.map((clue, i) => {
    const found = state.found.has(clue.id), locked = clue.mail && !state.mailed, now = clue === current;
    const seen = state.nudges[clue.id] ?? (i === 0 ? 1 : 0);
    const nudges = clue.nudges.slice(0, seen).map(nudge => `<li>${prose(nudge.text)}${nudge.try ? ` <button type="button" class="try" data-try="${escape(nudge.try)}" title="Put this in the terminal">${escape(nudge.try)}</button>` : ''}</li>`).join('');
    const body = found
      ? `<p class="answer">${prose(clue.answer)}</p>${clue.tip && clue.id === state.latest ? `<p class="tip">${prose(clue.tip)}</p>` : ''}`
      : now ? `${nudges ? `<ul class="nudges">${nudges}</ul>` : ''}${seen < clue.nudges.length ? `<button type="button" class="stuck" data-clue="${clue.id}">${seen ? 'Another nudge' : 'Stuck?'}</button>` : ''}` : '';
    return `<li class="clue ${found ? 'found' : locked ? 'locked' : now ? 'now' : 'ahead'}"><span class="mark" aria-hidden="true">${found ? '✓' : i + 1}</span><div><p class="question">${locked ? 'Something may turn up…' : escape(clue.question)}</p>${body}</div></li>`;
  }).join('') + (state.closed ? `<li class="closed-card"><p><b>Case closed.</b> ${plural(state.used.size, 'tool')} used, each doing one small job on lines of text.</p><p><a href="./#unixway">Try The Unix Way</a> · <a href="./">Back to Pipeviewer</a></p></li>` : '');
  // Earlier answers fold down to the answer alone; the tip stays on the latest, and the open
  // question is kept in view.
  $('#clues .clue.now')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  $('#tools').innerHTML = [...state.used].map(name => `<li><button type="button" data-tool="${escape(name)}">${escape(name)}</button></li>`).join('') || '<li class="none">Tools you use turn up here.</li>';
}
$('#clues').addEventListener('click', event => {
  const stuck = event.target.closest('.stuck'), attempt = event.target.closest('.try');
  if (stuck) {
    const clue = clues.find(c => c.id === stuck.dataset.clue);
    state.nudges[clue.id] = (state.nudges[clue.id] ?? (clue === clues[0] ? 1 : 0)) + 1;
    save();
    showNotebook();
  }
  if (attempt) { input.value = attempt.dataset.try; input.focus(); }
});
$('#tools').addEventListener('click', event => {
  const name = event.target.closest('[data-tool]')?.dataset.tool, card = $('#card');
  if (!name || card.dataset.tool === name && !card.hidden) { card.hidden = true; return; }
  const tool = tools[name];
  card.dataset.tool = name;
  card.innerHTML = `<p><code>${escape(name)}</code> ${escape(tool.summary)}</p><p class="usage">${escape(tool.usage)}</p>${tool.options.length ? `<dl>${tool.options.map(([flag, text]) => `<dt>${escape(flag)}</dt><dd>${escape(text)}</dd>`).join('')}</dl>` : ''}`;
  card.hidden = false;
});
$('#notes-head').addEventListener('click', () => {
  const open = $('#notes-head').getAttribute('aria-expanded') !== 'true';
  $('#notes-head').setAttribute('aria-expanded', open);
});

// The input line: Enter runs, the arrows walk the history, Tab completes a command or file name,
// Ctrl-C abandons the line and Ctrl-L clears the screen.
const input = $('#command');
let walk = -1, draft = '';
$('#input-line').addEventListener('submit', event => {
  event.preventDefault();
  const source = input.value;
  input.value = '';
  walk = -1;
  execute(source);
  stick();
});
input.addEventListener('keydown', event => {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    const past = state.history.filter(Boolean);
    if (!past.length) return;
    event.preventDefault();
    if (walk === -1) draft = input.value;
    walk = event.key === 'ArrowUp' ? Math.min(past.length - 1, walk + 1) : walk - 1;
    input.value = walk < 0 ? draft : past[past.length - 1 - walk];
    if (walk < 0) walk = -1;
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  } else if (event.key === 'Tab') {
    event.preventDefault();
    complete();
  } else if (event.ctrlKey && event.key === 'c' && input.selectionStart === input.selectionEnd) {
    // With nothing selected, Ctrl-C abandons the line, as in a terminal; with a selection it still copies.
    event.preventDefault();
    addEntry(`<div class="cmdline"><span class="ps">${escape(promptText())}</span> <span class="typed">${escape(input.value)}</span><span class="interrupt">^C</span></div>`, '');
    input.value = '';
    stick();
  } else if (event.ctrlKey && event.key === 'l') {
    event.preventDefault();
    scrollback.innerHTML = '';
  }
});
function complete() {
  const before = input.value.slice(0, input.selectionStart), after = input.value.slice(input.selectionStart);
  const word = before.match(/[^\s|<>;&]*$/)[0], first = !before.slice(0, before.length - word.length).replace(/.*[|;&]/, '').trim();
  const pool = first ? known : Object.keys(files());
  const hits = pool.filter(name => name.startsWith(word)).sort();
  if (!hits.length) return;
  let common = hits[0];
  for (const hit of hits) while (!hit.startsWith(common)) common = common.slice(0, -1);
  if (hits.length === 1) common += ' ';
  if (common.length > word.length) {
    input.value = before.slice(0, before.length - word.length) + common + after;
    const at = before.length - word.length + common.length;
    input.setSelectionRange(at, at);
  } else {
    // Several matches and nothing more in common: list them, as a shell does on a second Tab.
    addEntry(`<div class="cmdline"><span class="ps">${escape(promptText())}</span> <span class="typed">${escape(input.value)}</span></div>`, `<pre class="out"><span>${hits.map(escape).join('  ')}</span></pre>`);
    stick();
  }
}
// A click anywhere in the terminal goes to the input, unless it's selecting text or pressing a button.
$('#terminal').addEventListener('click', event => {
  if (event.target.closest('button, a') || getSelection().toString()) return;
  input.focus({ preventScroll: true });
});

// The header: the shell switch, the theme, and starting over.
function showShell() {
  $('#prompt').textContent = promptText();
  document.querySelectorAll('#shells [data-platform]').forEach(button => button.setAttribute('aria-pressed', button.dataset.platform === platform));
}
$('#shells').addEventListener('click', event => {
  const choice = event.target.closest('[data-platform]')?.dataset.platform;
  if (!choice || choice === platform) return;
  platform = choice;
  try { localStorage.setItem('pipeviewer-platform', platform); } catch {}
  showShell();
  system(platform === 'macos' ? 'Now in zsh, with the BSD and Apple versions of the tools, as on a Mac.' : 'Now in bash, with the GNU tools, as on Linux.');
  stick();
  input.focus();
});
const themes = ['light', 'dark', 'terminal'], themeNames = { light: 'Light', dark: 'Dark', terminal: 'Terminal' };
function showTheme() { $('#theme').textContent = themeNames[document.documentElement.dataset.theme]; }
$('#theme').addEventListener('click', () => {
  const next = themes[(themes.indexOf(document.documentElement.dataset.theme) + 1) % themes.length];
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('pipeviewer-theme', next); } catch {}
  showTheme();
});
$('#restart').addEventListener('click', () => {
  try { localStorage.removeItem(SESSION); } catch {}
  Object.assign(state, { history: [], found: new Set(), used: new Set(), nudges: {}, mailed: false, closed: false });
  scrollback.innerHTML = '';
  stages.clear();
  welcome();
  showNotebook();
  input.value = '';
  input.focus();
});

// Start: put back the last session by replaying it, or welcome a newcomer.
showShell();
showTheme();
welcome();
let saved = null;
try { saved = JSON.parse(localStorage.getItem(SESSION)); } catch {}
if (saved?.history?.length) {
  state.nudges = saved.nudges ?? {};
  for (const source of saved.history) execute(source, { replay: true });
  system('Picked up where you left off.');
}
showNotebook();
stick();
input.focus({ preventScroll: true });
