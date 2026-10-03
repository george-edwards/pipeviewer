// The n00b explainer: a few cards, each with one idea, an example and a small moving picture, shown
// before the n00b level's exercise. Pictures are coloured by stream, as the diagram is. They move
// with CSS keyframes over one shared loop, and each part's own style is where the loop leaves it, so
// with reduced motion a picture stands still and complete.
//
// title    the idea, in a few words.
// text     a sentence or two on it. Text in `backticks` is set as code.
// quote    optional, a quotation shown under the text, with `by` naming its source.
// example  a command that shows the idea, and a note on what the picture shows.
// picture  draws the example as SVG.
// video    in place of an example and a picture, a YouTube film, shown as a tape until it's played:
//          its id, the second to start at, and the label on the tape.

const LOOP = 7;

// Keyframes for one moving part, from [seconds, { x, y, o }] stops. The first and last stops hold
// to the ends of the loop.
function keyframes(name, stops) {
  const frame = (pct, { x = 0, y = 0, o = 1 }) => `${+pct.toFixed(2)}% { transform: translate(${x}px, ${y}px); opacity: ${o}; }`;
  const all = [[0, stops[0][1]], ...stops, [LOOP, stops.at(-1)[1]]];
  return `@keyframes ${name} { ${all.map(([t, at]) => frame(t / LOOP * 100, at)).join(' ')} }`;
}

// A picture collects the keyframes its parts ask for and puts them in its own <style>.
function picture(id, width, height, draw) {
  const styles = [];
  let n = 0;
  const move = stops => {
    const name = `${id}-${n++}`;
    styles.push(keyframes(name, stops), `.${name} { animation: ${name} ${LOOP}s linear infinite both; }`);
    return name;
  };
  const body = draw(move);
  return `<svg class="intro-picture" viewBox="0 0 ${width} ${height}" aria-hidden="true"><style>${styles.join(' ')}</style>${body}</svg>`;
}

const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');
const words = ['stdin', 'stdout', 'stderr'];

// A command's card. Ports sit at the same heights on every card: stdin and stdout on the first row,
// stderr on the second. `named` spells out each port's stream beside its number.
const row = [80, 108];
function card(x, w, name, { named = false, skip = [] } = {}) {
  const port = (fd, px, py, anchor) => skip.includes(fd) ? '' : `<circle class="pic-port fd${fd}" cx="${px}" cy="${py}" r="4.5"/>
    <text class="pic-fd fd${fd}" x="${anchor === 'start' ? px + 10 : px - 10}" y="${py + 4}" text-anchor="${anchor}">${named ? (anchor === 'start' ? `${fd} ${words[fd]}` : `${words[fd]} ${fd}`) : fd}</text>`;
  return `<g class="pic-card"><rect x="${x}" y="24" width="${w}" height="100" rx="9"/><text class="pic-name" x="${x + 12}" y="45">${esc(name)}</text><line x1="${x}" x2="${x + w}" y1="56" y2="56"/>
    ${port(0, x, row[0], 'start')}${port(1, x + w, row[0], 'end')}${port(2, x + w, row[1], 'end')}</g>`;
}

const wire = (x1, x2, y, fd, extra = '') => `<line class="pic-wire fd${fd} ${extra}" x1="${x1}" x2="${x2}" y1="${y}" y2="${y}"/>`;

// A pill of data, drawn centred on 0 and moved from x0 to x1 along y, starting at t0 and taking dur.
function token(move, text, fd, x0, x1, y, t0, dur) {
  const width = text.length * 7.2 + 14;
  const name = move([[t0, { x: x0, y, o: 0 }], [t0 + .15, { x: x0 + (x1 - x0) * .12, y }], [t0 + dur - .15, { x: x1 - (x1 - x0) * .12, y }], [t0 + dur, { x: x1, y, o: 0 }]]);
  return `<g class="pic-token ${name}"><rect class="fd${fd}" x="${-width / 2}" y="-10" width="${width}" height="20" rx="10"/><text y="4" text-anchor="middle">${esc(text)}</text></g>`;
}

// Something that appears at t and stays until the loop starts again.
const appears = (move, t) => move([[t, { o: 0 }], [t + .2, {}], [LOOP - .5, {}], [LOOP - .2, { o: 0 }]]);

const keyboard = (x, y) => `<g class="pic-device"><rect x="${x}" y="${y - 20}" width="64" height="40" rx="6"/>
  ${[0, 1, 2].map(r => [0, 1, 2, 3, 4].map(c => `<rect class="pic-key" x="${x + 7 + c * 10.5}" y="${y - 13 + r * 9}" width="8" height="6" rx="1.5"/>`).join('')).join('')}
  <text class="pic-label" x="${x + 32}" y="${y + 36}" text-anchor="middle">keyboard</text></g>`;

// A screen, with lines of text that appear as they arrive.
function screen(move, x, w, lines) {
  return `<g class="pic-device"><rect x="${x}" y="14" width="${w}" height="124" rx="8"/><line x1="${x}" x2="${x + w}" y1="30" y2="30"/>
    ${[0, 1, 2].map(i => `<circle class="pic-key" cx="${x + 11 + i * 9}" cy="22" r="2.5"/>`).join('')}
    <text class="pic-label" x="${x + w - 10}" y="25" text-anchor="end">screen</text>
    ${lines.map(({ text, fd, y, t }) => `<text class="pic-out fd${fd} ${appears(move, t)}" x="${x + 12}" y="${y}">${esc(text)}</text>`).join('')}</g>`;
}

// A small tag for a stream left on the terminal, as the diagram draws one.
const tag = (x, y, fd, text, anchor = 'start') => {
  const width = text.length * 6.4 + 14, left = anchor === 'start' ? x : x - width;
  return `<g class="pic-tag fd${fd}"><rect x="${left}" y="${y - 9}" width="${width}" height="18" rx="9"/><text x="${left + width / 2}" y="${y + 4}" text-anchor="middle">${text}</text></g>`;
};

export const slides = [
  {
    title: 'Every program has three streams',
    text: 'A program reads its input from stdin, writes its results to stdout, and writes its complaints to stderr. Unless you say otherwise, all three are hooked up to your terminal: stdin to the keyboard, stdout and stderr to the screen.',
    example: { command: 'sort', note: 'Run `sort` on its own and type a few words. It reads them from the keyboard on stdin, and when you press Ctrl-D it prints them in order on stdout.' },
    picture: () => picture('n00b-streams', 600, 150, move => [
      keyboard(14, row[0]),
      wire(82, 230, row[0], 0), wire(360, 446, row[0], 1), wire(360, 446, row[1], 2, 'idle'),
      card(230, 130, 'sort', { named: true }),
      screen(move, 446, 148, [{ text: 'apple', fd: 1, y: 54, t: 3.4 }, { text: 'fig', fd: 1, y: 72, t: 3.9 }, { text: 'pear', fd: 1, y: 90, t: 4.4 }]),
      ...['pear', 'apple', 'fig'].map((word, i) => token(move, word, 0, 110, 205, row[0], .3 + i * .6, 1.3)),
      ...['apple', 'fig', 'pear'].map((word, i) => token(move, word, 1, 365, 446, row[0], 2.8 + i * .5, .7)),
    ].join('')),
  },
  {
    title: 'They’re numbered 0, 1 and 2',
    text: 'The shell knows them by number: 0 is stdin, 1 is stdout and 2 is stderr. That’s why this is level 0: we count the way the shell does.',
    example: { command: 'ls todo.txt nope', note: '`ls` finds `todo.txt` but not `nope`. The name goes out on 1 and the complaint on 2. Both end up on the screen, but they get there separately, so they can be sent to different places.' },
    picture: () => picture('n00b-numbers', 600, 150, move => [
      keyboard(14, row[0]),
      wire(82, 150, row[0], 0, 'idle'), wire(300, 424, row[0], 1), wire(300, 424, row[1], 2),
      card(150, 150, 'ls todo.txt nope'),
      ...[[116, row[0], 0], [362, row[0] - 18, 1], [362, row[1] + 20, 2]].map(([x, y, fd]) => `<g class="pic-number fd${fd}"><circle cx="${x}" cy="${y}" r="11"/><text x="${x}" y="${y + 5}" text-anchor="middle">${fd}</text></g>`),
      screen(move, 424, 172, [{ text: 'todo.txt', fd: 1, y: 54, t: 2.1 }, { text: 'ls: nope: No such', fd: 2, y: 90, t: 3.4 }, { text: 'file or directory', fd: 2, y: 106, t: 3.4 }]),
      token(move, 'todo.txt', 1, 300, 424, row[0], 1.2, .9),
      token(move, 'error', 2, 300, 424, row[1], 2.5, .9),
    ].join('')),
  },
  {
    title: 'A pipe joins 1 to 0',
    text: '`|` connects the stdout (1) of the command on its left to the stdin (0) of the command on its right. The output of one goes straight in as the input of the next, without touching the screen.',
    example: { command: 'ls | wc -l', note: '`ls` lists the files here, and `wc -l` counts the lines it’s given. stderr isn’t part of the pipe: each command’s complaints still go to the screen.' },
    picture: () => picture('n00b-pipe', 600, 150, move => [
      wire(76, 110, row[0], 0, 'idle'), tag(76, row[0], 0, 'keyboard', 'end'),
      wire(220, 236, row[1], 2, 'idle'), tag(236, row[1], 2, 'screen'),
      wire(220, 340, row[0], 1), `<text class="pic-label" x="280" y="${row[0] - 16}" text-anchor="middle">pipe</text>`,
      wire(450, 500, row[0], 1), wire(450, 500, row[1], 2, 'idle'),
      card(110, 110, 'ls'), card(340, 110, 'wc -l'),
      screen(move, 500, 96, [{ text: '3', fd: 1, y: 84, t: 4.2 }]),
      ...['a.txt', 'b.md', 'c.txt'].map((word, i) => token(move, word, 1, 222, 338, row[0], .6 + i * .8, 1.1)),
      token(move, '3', 1, 452, 500, row[0], 3.6, .6),
    ].join('')),
  },
  {
    title: 'Screw in another segment',
    text: 'McIlroy pushed for pipes for years, and in 1973 Ken Thompson added them to Unix in a single night. Every `|` adds another segment to the hose.',
    quote: 'We should have some ways of coupling programs like garden hose—screw in another segment when it becomes necessary to massage data in another way.',
    by: 'Doug McIlroy, Bell Labs memo, 1964',
    example: { command: 'ls | grep txt | wc -l', note: '`grep txt` passes on only the lines with “txt” in them, so `wc -l` now counts just the `.txt` files.' },
    picture: () => {
      return picture('n00b-hose', 640, 150, move => {
        const segment = move([[0, { y: -46, o: 0 }], [.7, {}], [LOOP - .5, {}], [LOOP - .2, { o: 0 }]]);
        return [
          card(16, 80, 'ls', { skip: [0] }), card(356, 90, 'wc -l'),
          `<g class="${segment}">${wire(96, 176, row[0], 1)}${wire(276, 356, row[0], 1)}${card(176, 100, 'grep txt')}</g>`,
          wire(446, 506, row[0], 1),
          screen(move, 506, 124, [{ text: '2', fd: 1, y: 84, t: 4.9 }]),
          ...['a.txt', 'b.md', 'c.txt'].map((word, i) => token(move, word, 1, 98, 174, row[0], 1 + i * .45, .9)),
          ...['a.txt', 'c.txt'].map((word, i) => token(move, word, 1, 278, 354, row[0], 2.6 + i * .45, .9)),
          token(move, '2', 1, 448, 506, row[0], 4.2, .7),
        ].join('');
      });
    },
  },
  {
    title: 'Rewind to 1982',
    text: 'Blow the dust off the VHS. Bell Labs filmed the people who built Unix, and here’s Brian Kernighan on why the pipe is the system’s “fundamental contribution”.',
    video: { id: 'tc4ROCJYbm0', start: 330, label: ['THE UNIX SYSTEM', 'BELL LABS · 1982'] },
  },
];
