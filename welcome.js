// The Intro: a few steps on what Pipeviewer is for, built round two films of the same two commands in
// either order. `sleep 2 | echo "hello, world"` prints at once; `echo "hello, world" | sleep 2` prints
// nothing. The films use Why Unix?'s film engine, and play by themselves when their step comes up.
//
// On a first visit the full stop in the brand hops along the header into the Intro button, which
// stays lit until it's opened.

import { Take, STOP, TEMPO, draw, place, at, tool } from './whyscenes.js';

const $ = selector => document.querySelector(selector);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const SEEN = 'pipeviewer-welcome';
// Unset on a first visit, 'hopped' once the full stop has hopped into the button, 'seen' once the
// Intro has been opened.
const visit = () => { try { return localStorage.getItem(SEEN); } catch { return 'seen'; } };

/* ---------- the films' pieces ---------- */
const CHAR = 9.6, Y = 90, TERM = 172, LINES = [205, 233, 261], LEFT = 62;

// The terminal, along the bottom, with the command typed in a letter at a time.
function terminal(t, parent) {
  const g = draw(parent, 'g');
  draw(g, 'rect', { x: 40, y: TERM, width: 680, height: 112, rx: 10, class: 'sc-term' });
  const line = n => place(draw(g, 'text', { class: 'sc-tty', x: LEFT, y: LINES[n] }), 0, 0);
  // What has appeared under the command, so a rewind can take it away again.
  const after = [];
  return {
    g,
    async type(command) {
      const text = line(0);
      draw(text, 'tspan', { class: 'sc-prompt' }, '$ ');
      const typed = draw(text, 'tspan');
      for (let i = 1; i <= command.length; i++) {
        typed.textContent = command.slice(0, i);
        await t.wait(28);
      }
    },
    print(n, words) {
      const text = place(draw(g, 'text', { class: 'sc-tty', x: LEFT, y: LINES[n] }, words), 0, 0);
      after.push(text);
      return t.fadeIn(text, { shift: [0, 0], duration: 250 });
    },
    // A fresh prompt, with its cursor two letters along.
    // Back to just after the command was typed.
    async rewind() {
      await Promise.all(after.map(el => t.fadeOut(el, { duration: 400 })));
      after.splice(0).forEach(el => el.remove());
    },
    prompt(n) {
      const ready = place(draw(g, 'g'), 0, 0);
      draw(ready, 'text', { class: 'sc-tty sc-prompt', x: LEFT, y: LINES[n] }, '$');
      draw(ready, 'rect', { x: LEFT + 18, y: LINES[n] - 13, width: 9, height: 17, class: 'sc-cursor' });
      after.push(ready);
      return t.fadeIn(ready, { shift: [0, 0], duration: 300 });
    },
  };
}
// A running program: its command in a box. `arg` gives where its words sit in the box, by letter.
function program(parent, command, x) {
  const p = tool(parent, command, null, x, Y);
  p.x = x;
  p.left = x - p.w / 2;
  p.right = x + p.w / 2;
  p.letter = i => x - command.length * CHAR / 2 + i * CHAR;
  return p;
}
// A program ending: it greys out, with its exit status under it.
function exit(t, parent, p) {
  const status = place(draw(parent, 'text', { class: 'sc-says sc-exit' }, 'exit 0'), p.x, Y + 42);
  return Promise.all([t.animate(p.g, [{ opacity: 1 }, { opacity: .38 }], { duration: 500 }), t.fadeIn(status, { shift: [0, -4], duration: 400 })]);
}
// sleep's clock, above its box, which sweeps round once over its two seconds. The films stretch the
// two seconds to give time to watch.
function clock(t, parent, x) {
  const g = place(draw(parent, 'g', { class: 'sc-clock' }), x, Y - 46);
  const face = draw(g, 'circle', { r: 14, class: 'sc-clock-face' });
  const sweep = draw(g, 'circle', { r: 14, class: 'sc-clock-sweep', transform: 'rotate(-90)', pathLength: 1 });
  Object.assign(sweep.style, { strokeDasharray: '1 1', strokeDashoffset: 1 });
  const label = draw(g, 'text', { class: 'sc-clock-label' }, '2s');
  return {
    g,
    show: () => Promise.all([t.create(face, { duration: 600 }), t.create(label, { duration: 600 })]),
    run: duration => t.animate(sweep, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration, easing: 'linear' }),
  };
}
// echo's words, as a pill of stdout's colour.
function words(parent, x, y) {
  const g = place(draw(parent, 'g', { class: 'sc-words' }), x, y);
  draw(g, 'rect', { x: -54, y: -12, width: 108, height: 24, rx: 12 });
  draw(g, 'text', {}, 'hello, world');
  return g;
}
// An unread stdin: the hollow port the diagram uses for an end nobody reads.
const port = (parent, x) => place(draw(parent, 'circle', { r: 5.5, class: 'sc-port' }), x, Y);
// Draws the eye to a point: a ring that spreads and fades, twice.
async function ping(t, parent, x, y) {
  for (let i = 0; i < 2; i++) {
    const ring = place(draw(parent, 'circle', { r: 7, class: 'sc-ping' }), x, y);
    await t.animate(ring, [{ opacity: .9, transform: at(ring, 0, 0, 'scale(1)') }, { opacity: 0, transform: at(ring, 0, 0, 'scale(3.4)') }], { duration: 800 });
    ring.remove();
  }
}
const thicken = (t, wire) => t.animate(wire, [{ strokeWidth: 3 }, { strokeWidth: 7 }, { strokeWidth: 3 }, { strokeWidth: 7 }, { strokeWidth: 3 }], { duration: 1600 });

function layers(t) {
  return { wires: draw(t.svg, 'g'), boxes: draw(t.svg, 'g'), flow: draw(t.svg, 'g'), top: draw(t.svg, 'g') };
}

/* ---------- film one: sleep 2 | echo "hello, world" ---------- */
async function echoLast(t) {
  const { wires, boxes, flow, top } = layers(t);
  // First it just runs, in real time and with nothing to read, so the words showing up before the
  // two seconds are up is the one thing to see.
  t.next();
  const term = terminal(t, boxes);
  await t.create(term.g.firstChild, { duration: 400 });
  await term.type('sleep 2 | echo "hello, world"');
  await t.wait(450);
  await term.print(1, 'hello, world');
  await t.wait(2000 / TEMPO);
  await term.prompt(2);
  await t.wait(1600);

  await t.say('The words came at once, and the prompt two seconds later. Now again, slowly.');
  await t.wait(1200);
  await term.rewind();

  await t.say('The shell starts both programs at the same moment, joined by a pipe.');
  const sleep = program(boxes, 'sleep 2', 170), echo = program(boxes, 'echo "hello, world"', 470);
  await Promise.all([t.create(sleep.g), t.create(echo.g)]);
  const pipe = draw(wires, 'line', { x1: sleep.right, y1: Y, x2: echo.left, y2: Y, class: 'sc-pipe' });
  const out = draw(wires, 'line', { x1: echo.x, y1: Y + 20, x2: echo.x, y2: TERM, class: 'sc-out' });
  const unread = port(top, echo.left), timer = clock(t, top, sleep.x);
  await Promise.all([t.create(pipe, { duration: 500 }), t.create(out, { duration: 500 }), t.create(unread, { duration: 500 }), timer.show()]);

  await t.say('sleep starts its two seconds. echo prints its words straight away.');
  const sleeping = timer.run(3000);
  const chip = words(flow, echo.x, Y + 42);
  await t.fadeIn(chip, { shift: [(echo.letter(5) + echo.letter(19)) / 2 - echo.x, -42], duration: 600 });
  await t.move(chip, echo.x, LINES[1] - 5, { duration: 700 });
  await t.move(chip, LEFT + 54, LINES[1] - 5, { duration: 600 });
  await Promise.all([t.fadeOut(chip, { duration: 250 }), term.print(1, 'hello, world')]);
  await exit(t, top, echo);
  await sleeping;

  await t.say('Two seconds later sleep exits too, and the prompt comes back.');
  await Promise.all([exit(t, top, sleep), t.fadeOut(pipe), t.fadeOut(timer.g)]);
  await term.prompt(2);
  await t.wait(1200);

  await t.say('Why so soon? echo never reads its stdin. Its words come from its argument.');
  const underline = draw(top, 'line', { x1: echo.letter(5), y1: Y + 13, x2: echo.letter(19), y2: Y + 13, class: 'sc-underline' });
  await Promise.all([ping(t, top, echo.left, Y), t.create(underline, { duration: 700, delay: 900 })]);
  await t.wait(800);

  await t.say('And echo’s stdout is the terminal, so its words show up the moment it writes them.');
  await thicken(t, out);
  await t.end();
}

/* ---------- film two: echo "hello, world" | sleep 2 ---------- */
async function echoFirst(t) {
  const { wires, boxes, flow, top } = layers(t);
  await t.say('Now swap them round.');
  const term = terminal(t, boxes);
  await t.create(term.g.firstChild, { duration: 600 });
  await term.type('echo "hello, world" | sleep 2');
  await t.wait(500);

  await t.say('Both start at once again. This time echo’s stdout is the pipe.');
  const echo = program(boxes, 'echo "hello, world"', 230), sleep = program(boxes, 'sleep 2', 570);
  await Promise.all([t.create(echo.g), t.create(sleep.g)]);
  const pipe = draw(wires, 'line', { x1: echo.right, y1: Y, x2: sleep.left, y2: Y, class: 'sc-pipe' });
  const out = draw(wires, 'line', { x1: sleep.x, y1: Y + 20, x2: sleep.x, y2: TERM, class: 'sc-out' });
  const unread = port(top, sleep.left), timer = clock(t, top, sleep.x);
  await Promise.all([t.create(pipe, { duration: 500 }), t.create(out, { duration: 500 }), t.create(unread, { duration: 500 }), timer.show()]);

  await t.say('echo writes its words into the pipe, and exits.');
  const sleeping = timer.run(6000);
  const middle = (echo.right + sleep.left) / 2;
  const chip = words(flow, echo.right + 8, Y);
  await t.fadeIn(chip, { shift: [(echo.letter(5) + echo.letter(19)) / 2 - echo.right - 8, 0], duration: 600 });
  await t.move(chip, middle, Y, { duration: 700 });
  await exit(t, top, echo);

  await t.say('But sleep never reads its stdin. It just sleeps, and the words wait in the pipe.');
  await ping(t, top, sleep.left, Y);
  await sleeping;

  await t.say('After two seconds sleep exits 0. The pipe is torn down, and the words go with it.');
  await exit(t, top, sleep);
  await Promise.all([t.fadeOut(pipe, { duration: 700 }), t.fadeOut(timer.g), t.move(chip, middle, Y + 46, { duration: 900 }), t.fadeOut(chip, { duration: 700, delay: 300 })]);
  await term.prompt(1);
  await t.wait(1000);

  await t.say('Nothing reached the terminal. The only way there was sleep’s stdout, and sleep wrote nothing.');
  await thicken(t, out);
  await t.end();
}

// Each film, with roughly how long each of its captions stays up, for the timeline.
const films = { 'scene-echo-last': [echoLast, [8600, 6000, 5700, 6400, 5200, 6500, 6200]], 'scene-echo-first': [echoFirst, [4900, 6000, 6300, 13000, 7200, 6000]] };
let take = null;
function play(figure) {
  take?.stop();
  const [script, beats] = films[figure.id];
  figure.classList.add('played');
  take = new Take(figure, beats);
  script(take).catch(error => { if (error !== STOP) throw error; });
}
const stopFilm = () => { take?.stop(); take = null; };

/* ---------- the steps ---------- */
// drawCommand: puts a command in the viewer's editor and draws it.
export function setupWelcome(drawCommand) {
  const dialog = $('#welcome'), steps = [...dialog.querySelectorAll('.welcome-step')], button = $('#welcome-button');
  let step = 0;
  for (const id of Object.keys(films)) {
    const figure = $(`#${id}`);
    figure.querySelector('.scene-timeline').innerHTML = films[id][1].map(ms => `<span style="flex: ${ms}"><i></i></span>`).join('');
    figure.querySelector('.scene-replay').addEventListener('click', () => play(figure));
  }
  function show(n) {
    stopFilm();
    step = n;
    steps.forEach((section, i) => { section.hidden = i !== n; });
    $('#welcome-title').innerHTML = steps[n].dataset.title;
    $('#welcome-dots').innerHTML = steps.map((_, i) => `<i${i === n ? ' class="on"' : ''}></i>`).join('');
    $('#welcome-back').hidden = !n;
    $('#welcome-next').textContent = steps[n].dataset.next ?? 'Next';
    const figure = steps[n].querySelector('.scene');
    if (figure) play(figure);
  }
  const next = () => step === steps.length - 1 ? dialog.close() : show(step + 1);
  function open() {
    try { localStorage.setItem(SEEN, 'seen'); } catch {}
    button.classList.remove('fresh');
    show(0);
    dialog.showModal();
    $('#welcome-next').focus();
  }
  button.addEventListener('click', open);
  $('#welcome-next').addEventListener('click', next);
  $('#welcome-back').addEventListener('click', () => show(Math.max(0, step - 1)));
  $('#close-welcome').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', stopFilm);
  // The arrows step through the Intro, and go no further, so they don't also turn the page behind it.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'ArrowRight') next();
    else if (step) show(step - 1);
  });
  dialog.addEventListener('click', event => {
    const chip = event.target.closest('[data-draw]');
    if (chip) { dialog.close(); drawCommand(chip.dataset.draw); return; }
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  // The hop waits for the web fonts, so the full stop it lifts is where it will stay.
  if (visit() === 'hopped') button.classList.add('fresh');
  else if (!visit()) addEventListener('load', () => document.fonts.ready.then(() => setTimeout(() => hop(button), 700)), { once: true });
}

/* ---------- the first-visit hop ---------- */
// The brand's full stop leaves its place, swells, and bounces along the header into the Intro button,
// trailing a few fading copies of itself. The button lights up as it lands and keeps glowing until it's
// opened. A new stop grows back in the brand. It hops once; the glow stays until the Intro is opened.
function hop(button) {
  button.classList.add('fresh');
  const dot = $('.brand-dot');
  if (reduced.matches || !dot || !button.offsetParent) return;
  try { localStorage.setItem(SEEN, 'hopped'); } catch {}
  // Where the stop's ink is: canvas measures it against the baseline, which sits the font's ascent
  // below the top of the span's box.
  const from = dot.getBoundingClientRect(), to = button.getBoundingClientRect(), style = getComputedStyle(dot);
  const pen = document.createElement('canvas').getContext('2d');
  pen.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const ink = pen.measureText('.'), baseline = from.top + ink.fontBoundingBoxAscent;
  const size = Math.max(3, ink.actualBoundingBoxRight + ink.actualBoundingBoxLeft);
  const x0 = from.left + (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2, y0 = baseline - (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2;
  const dx = to.left + to.width / 2 - x0, dy = to.top + to.height / 2 - y0;
  // Three hops, each lower than the last, the first no higher than the stop sits below the window's top.
  const room = Math.max(12, y0 - size * 3), hops = [[.44, Math.min(40, room)], [.32, Math.min(24, room)], [.24, 10]], frames = [];
  let start = 0;
  for (const [n, [share, height]] of hops.entries()) {
    for (let i = 0; i <= 12; i++) {
      const s = i / 12, along = start + share * s, grow = n === 0 ? 1 + 1.6 * Math.min(1, s * 2) : n === 2 ? 2.6 - 1.8 * s : 2.6;
      frames.push({ offset: along, transform: `translate(${dx * along}px, ${dy * along - height * 4 * s * (1 - s)}px) scale(${grow})` });
    }
    start += share;
  }
  const path = frames.filter((frame, i) => !i || frame.offset > frames[i - 1].offset);
  const balls = [0, 1, 2, 3].map(i => {
    const ball = document.createElement('span');
    ball.className = 'welcome-ball';
    Object.assign(ball.style, { left: `${x0 - size / 2}px`, top: `${y0 - size / 2}px`, width: `${size}px`, height: `${size}px`, opacity: 1 - i * .24 });
    document.body.append(ball);
    return ball.animate(path, { duration: 1500, delay: i * 45, easing: 'linear', fill: 'both' });
  });
  button.classList.add('waiting');
  dot.style.visibility = 'hidden';
  balls[0].finished.then(() => {
    button.classList.remove('waiting');
    button.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    dot.style.visibility = '';
    dot.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 500, delay: 300, easing: 'cubic-bezier(.3, 1.6, .5, 1)', fill: 'backwards' });
  });
  Promise.all(balls.map(ball => ball.finished)).then(() => balls.forEach(ball => ball.effect.target.remove()));
}
