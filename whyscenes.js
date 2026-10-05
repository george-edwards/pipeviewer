// Why Unix?'s two films, drawn in SVG and animated in the manner of 3Blue1Brown's Manim: outlines draw
// themselves in and then fill, things glide and fade with one smooth ease, and a caption under the
// picture says what is happening. Each film plays once when it first comes into view, and again from
// its Replay button. With reduced motion a film shows its last frame at once.

const NS = 'http://www.w3.org/2000/svg';
const SMOOTH = 'cubic-bezier(.65, 0, .35, 1)';
const STOP = Symbol('stop');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const shapes = 'path, rect, circle, line, polyline, ellipse';

function draw(parent, tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  parent.append(el);
  return el;
}
// Each thing keeps where it is, and its own scale, so every animated transform can start from them.
const at = (el, dx = 0, dy = 0, extra = '') => `translate(${el.at[0] + dx}px, ${el.at[1] + dy}px) ${el.scale ?? ''} ${extra}`;
const place = (el, x, y, scale) => { el.at = [x, y]; if (scale) el.scale = scale; el.style.transform = at(el); return el; };

// One showing of a film. Replaying stops the showing under way, wherever it has got to.
class Take {
  constructor(figure) {
    this.svg = figure.querySelector('svg');
    this.caption = figure.querySelector('figcaption');
    this.fast = reduced.matches;
    this.running = new Set();
    this.stopped = false;
    this.svg.replaceChildren();
    this.caption.textContent = '';
  }
  stop() { this.stopped = true; this.running.forEach(animation => animation.cancel()); }
  async animate(el, keyframes, { duration = 800, delay = 0, easing = SMOOTH } = {}) {
    if (this.stopped) throw STOP;
    const animation = el.animate(keyframes, { duration: this.fast ? 0 : duration, delay: this.fast ? 0 : delay, easing, fill: 'both' });
    this.running.add(animation);
    try { await animation.finished; } catch { throw STOP; }
    this.running.delete(animation);
    if (this.stopped) throw STOP;
    // Keep the end state as plain style, so the next move starts from it.
    try { animation.commitStyles(); animation.cancel(); } catch {}
  }
  async wait(ms) {
    if (!this.fast) await new Promise(resolve => setTimeout(resolve, ms));
    if (this.stopped) throw STOP;
  }
  // Manim's Create: each outline draws itself, then fills, and any words fade up.
  create(el, { duration = 900, delay = 0 } = {}) {
    const lines = [...(el.matches(shapes) ? [el] : []), ...el.querySelectorAll(shapes)];
    const words = el.matches('text') ? [el] : [...el.querySelectorAll('text')];
    return Promise.all([
      ...lines.map(line => {
        line.setAttribute('pathLength', 1);
        line.style.strokeDasharray = '1 1';
        return this.animate(line, [{ strokeDashoffset: 1, fillOpacity: 0 }, { strokeDashoffset: 0, fillOpacity: 0, offset: .65 }, { strokeDashoffset: 0, fillOpacity: 1 }], { duration, delay });
      }),
      ...words.map(word => this.animate(word, [{ opacity: 0 }, { opacity: 0, offset: .45 }, { opacity: 1 }], { duration, delay })),
    ]);
  }
  fadeIn(el, { shift = [0, 8], duration = 600, delay = 0 } = {}) {
    return this.animate(el, [{ opacity: 0, transform: at(el, ...shift) }, { opacity: 1, transform: at(el) }], { duration, delay });
  }
  fadeOut(el, { duration = 500, delay = 0 } = {}) {
    return this.animate(el, [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration, delay });
  }
  move(el, x, y, { duration = 900, delay = 0 } = {}) {
    const from = at(el);
    el.at = [x, y];
    return this.animate(el, [{ transform: from }, { transform: at(el) }], { duration, delay });
  }
  grow(el, scale, { duration = 400, delay = 0 } = {}) {
    const from = at(el);
    el.scale = scale;
    return this.animate(el, [{ transform: from }, { transform: at(el) }], { duration, delay });
  }
  // The caption fades across to the next line.
  async say(text) {
    if (this.fast) { this.caption.textContent = text; return; }
    if (this.caption.textContent) await this.animate(this.caption, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
    this.caption.textContent = text;
    await this.animate(this.caption, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 450 });
  }
}

// A tool: its name in a box, with what it does underneath.
const CHAR = 9.6;
function tool(parent, name, says, x, y) {
  const g = place(draw(parent, 'g', { class: 'sc-tool' }), x, y), w = 26 + name.length * CHAR;
  draw(g, 'rect', { x: -w / 2, y: -20, width: w, height: 40, rx: 8, class: 'sc-box' });
  draw(g, 'text', { class: 'sc-cmd', y: 1 }, name);
  const caption = says ? draw(g, 'text', { class: 'sc-says', y: 40 }, says) : null;
  return { g, w, says: caption };
}
const PAGE = 'M-14 -18H6L14 -10V18H-14Z M6 -18V-10H14';
function fileGlyph(parent, x, y, label) {
  const g = place(draw(parent, 'g', { class: 'sc-file' }), x, y, 'scale(1.25)');
  draw(g, 'path', { d: PAGE, class: 'sc-page' });
  for (const [i, w] of [16, 16, 10].entries()) draw(g, 'path', { d: `M-8 ${-4 + i * 6}h${w}`, class: 'sc-ink' });
  if (label) draw(g, 'text', { class: 'sc-path', y: 36 }, label);
  return g;
}
// A line of text in the stream, coloured by what it is about: one of three addresses, or noise.
function bar(parent, kind, x, y) {
  return place(draw(parent, 'rect', { x: -14, y: -2.5, width: 28, height: 5, rx: 2.5, class: `sc-line ${kind}` }), x, y);
}

/* ---------- film one: small tools, each doing one thing ---------- */
async function smallTools(t) {
  const Y = 150, stack = (i, n) => Y + (i - (n - 1) / 2) * 9;
  const pipes = draw(t.svg, 'g'), flow = draw(t.svg, 'g'), boxes = draw(t.svg, 'g'), top = draw(t.svg, 'g');
  const KIT = [['grep', 'finds lines'], ['sort', 'puts them in order'], ['uniq -c', 'counts repeats'], ['head -1', 'keeps the first']];
  const loose = [[175, 78], [520, 70], [255, 205], [590, 198]], row = [210, 340, 480, 620];

  t.say('Unix comes with hundreds of small tools. Each does one job, and does it well.');
  const kit = KIT.map(([name, says], i) => tool(boxes, name, says, ...loose[i]));
  await Promise.all(kit.map((k, i) => t.create(k.g, { delay: i * 220 })));
  await t.wait(1600);

  t.say('Join them with pipes, and lines of text flow from one to the next.');
  await Promise.all(kit.map(k => t.fadeOut(k.says, { duration: 300 })));
  await Promise.all(kit.map((k, i) => t.move(k.g, row[i], Y, { duration: 1000, delay: i * 70 })));
  const doc = fileGlyph(boxes, 62, Y, 'access.log');
  const edges = [[86, row[0] - kit[0].w / 2], ...row.slice(1).map((x, i) => [row[i] + kit[i].w / 2, x - kit[i + 1].w / 2]), [row[3] + kit[3].w / 2, 688]];
  const links = edges.map(([a, b]) => draw(pipes, 'line', { x1: a, y1: Y, x2: b, y2: Y, class: 'sc-pipe' }));
  await t.create(doc, { duration: 600 });
  await Promise.all(links.map((link, i) => t.create(link, { duration: 450, delay: i * 120 })));

  // Sixteen lines leave the log. grep keeps the failed logins, sort groups them, uniq -c counts each
  // group, and head -1 keeps the top one.
  const kinds = ['a', 'n', 'b', 'a', 'n', 'c', 'a', 'b', 'n', 'a', 'b', 'n', 'c', 'a', 'b', 'n'];
  const stations = [128, 275, 402, 550, 716];
  const lines = kinds.map((kind, i) => ({ kind, y: stack(i, kinds.length), el: bar(flow, kind, stations[0], stack(i, kinds.length)) }));
  await Promise.all(lines.map((line, i) => t.fadeIn(line.el, { shift: [-10, 0], delay: i * 30, duration: 400 })));
  await t.wait(300);

  const kept = lines.filter(line => line.kind !== 'n');
  await Promise.all([
    ...kept.map((line, i) => t.move(line.el, stations[1], stack(i, kept.length), { duration: 1100 })),
    ...lines.filter(line => line.kind === 'n').map(line => Promise.all([t.move(line.el, row[0], line.y, { duration: 700 }), t.fadeOut(line.el, { delay: 450, duration: 300 })])),
  ]);
  const order = ['a', 'b', 'c'], sorted = [...kept].sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
  await Promise.all(sorted.map((line, i) => t.move(line.el, stations[2], stack(i, sorted.length), { duration: 1100 })));

  const groups = order.map((kind, i) => ({ kind, y: Y + (i - 1) * 24, lines: sorted.filter(line => line.kind === kind) }));
  await Promise.all(groups.flatMap(group => group.lines.map(line => t.move(line.el, stations[3], group.y, { duration: 1000 }))));
  const counts = groups.map(group => {
    group.lines.slice(1).forEach(line => line.el.remove());
    group.bar = group.lines[0].el;
    group.label = place(draw(top, 'text', { class: `sc-count ${group.kind}`, x: 22 }, String(group.lines.length)), stations[3], group.y);
    return group;
  });
  await Promise.all(counts.flatMap(group => [t.grow(group.bar, 'scale(1.35, 1.6)'), t.fadeIn(group.label, { shift: [-6, 0], duration: 400 })]));
  await t.wait(400);

  const [first, ...rest] = counts;
  await Promise.all([
    ...rest.flatMap(group => [t.move(group.bar, row[3], group.y, { duration: 700 }), t.move(group.label, row[3], group.y, { duration: 700 }), t.fadeOut(group.bar, { delay: 400, duration: 250 }), t.fadeOut(group.label, { delay: 400, duration: 250 })]),
    t.move(first.bar, stations[4], Y, { duration: 1100 }), t.move(first.label, stations[4], Y, { duration: 1100 }),
  ]);
  const ring = place(draw(top, 'circle', { r: 26, class: 'sc-ring' }), stations[4] + 8, Y);
  t.say('Each did one small job. Together they found the address that failed most.');
  await t.create(ring, { duration: 700 });
  await t.wait(2200);

  // Swapping the last tool makes a different program from the same parts.
  t.say('Swap one tool and you have a different program. Now it counts the addresses.');
  const wc = tool(boxes, 'wc -l', null, row[3], Y);
  await Promise.all([t.fadeOut(kit[3].g, { duration: 400 }), t.fadeOut(ring, { duration: 400 }), t.fadeOut(first.bar, { duration: 400 }), t.fadeOut(first.label, { duration: 400 }), t.create(wc.g, { duration: 700, delay: 200 })]);
  const again = counts.map(group => ({ bar: bar(flow, group.kind, stations[3], group.y) }));
  await Promise.all(again.map(({ bar: el }, i) => t.fadeIn(el, { shift: [-8, 0], delay: i * 80, duration: 350 })));
  await Promise.all(again.map(({ bar: el }) => Promise.all([t.move(el, row[3], Y, { duration: 700 }), t.fadeOut(el, { delay: 450, duration: 250 })])));
  const three = place(draw(top, 'text', { class: 'sc-total' }, '3'), stations[4], Y);
  await t.fadeIn(three, { shift: [-10, 0], duration: 500 });
  await t.wait(2400);

  await t.say('“Write programs that do one thing and do it well. Write programs to work together.” Doug McIlroy, who came up with Unix pipes.');
}

/* ---------- film two: everything is a file ---------- */
const ICONS = [
  ['a document', 'notes.txt', ['M-14 -18H6L14 -10V18H-14Z', 'M6 -18V-10H14', 'M-8 -4h16', 'M-8 2h16', 'M-8 8h10']],
  ['a setting', '/etc/hostname', ['M-18 -10h36', 'M-18 0h36', 'M-18 10h36', 'M-4 -10m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', 'M8 0m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', 'M-10 10m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0']],
  ['a disk', '/dev/sda', ['M-20 -12h40v24h-40Z', 'M-14 0h16', 'M12 0m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0']],
  ['a running program', '/proc/42/status', ['M-20 0h8l4 -11l7 22l6 -16l3 5h12']],
  ['your terminal', '/dev/tty', ['M-20 -14h40v28h-40Z', 'M-13 -5l6 5l-6 5', 'M-2 6h12']],
];
async function everythingIsAFile(t) {
  const Y = 96, xs = [110, 245, 380, 515, 650];
  const wires = draw(t.svg, 'g'), flow = draw(t.svg, 'g'), things = draw(t.svg, 'g');

  t.say('A document. A setting. A disk. A running program. The terminal you type in.');
  const items = ICONS.map(([name, path, d], i) => {
    const icon = place(draw(things, 'g', { class: 'sc-icon' }), xs[i], Y, 'scale(1.2)');
    d.forEach(segment => draw(icon, 'path', { d: segment }));
    const label = place(draw(things, 'text', { class: 'sc-says' }, name), xs[i], Y + 46);
    return { icon, label, path };
  });
  await Promise.all(items.flatMap((item, i) => [t.create(item.icon, { delay: i * 260 }), t.fadeIn(item.label, { delay: i * 260 + 300 })]));
  await t.wait(1600);

  t.say('To Unix, every one of them is a file, with a name you can type.');
  const files = await Promise.all(items.map(async (item, i) => {
    await t.wait(i * 160);
    const file = fileGlyph(things, xs[i], Y, item.path);
    await Promise.all([
      t.animate(item.icon, [{ opacity: 1, transform: at(item.icon) }, { opacity: 0, transform: at(item.icon, 0, 0, 'scale(.6)') }], { duration: 500 }),
      t.fadeOut(item.label, { duration: 300 }),
      t.create(file, { duration: 800, delay: 250 }),
    ]);
    return file;
  }));
  await t.wait(1400);

  t.say('So one small tool can read every one of them. No special app for each.');
  const cat = tool(things, 'cat', null, 380, 238);
  await t.create(cat.g, { duration: 700 });
  const out = draw(wires, 'line', { x1: 380 + cat.w / 2, y1: 238, x2: 720, y2: 238, class: 'sc-pipe' });
  const paths = xs.map(x => draw(wires, 'path', { d: `M${x} ${Y + 52}C${x} 200 380 180 380 218`, class: 'sc-wire' }));
  await Promise.all([...paths.map((path, i) => t.create(path, { duration: 600, delay: i * 140 })), t.create(out, { duration: 600, delay: 500 })]);
  // A line comes out of each file, through cat, and on down the pipe.
  await Promise.all(xs.map(async (x, i) => {
    for (let k = 0; k < 2; k++) {
      const el = bar(flow, ['a', 'b', 'c', 'a', 'b'][i], x, Y + 54);
      await t.wait(i * 220 + k * 520);
      await t.fadeIn(el, { shift: [0, -6], duration: 250 });
      await t.move(el, 380, 238, { duration: 750 });
      await t.move(el, 700, 238, { duration: 750 });
      await t.fadeOut(el, { duration: 250 });
    }
  }));
  files.forEach(file => file.classList.add('lit'));
  await t.say('Everything is a file. One way to read, write and connect all of it.');
}

const films = [['#scene-tools', smallTools], ['#scene-files', everythingIsAFile]];
const takes = new Map();
function play(figure, script) {
  takes.get(figure)?.stop();
  const take = new Take(figure);
  takes.set(figure, take);
  script(take).catch(error => { if (error !== STOP) throw error; });
}
// Each film starts when most of it is in view, the first time; Replay plays it again.
let watching = false;
export function playScenes() {
  if (watching) return;
  watching = true;
  for (const [at, script] of films) {
    const figure = document.querySelector(at);
    figure.querySelector('.scene-replay').addEventListener('click', () => play(figure, script));
    const watch = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      watch.disconnect();
      play(figure, script);
    }, { threshold: .55 });
    watch.observe(figure);
  }
}
