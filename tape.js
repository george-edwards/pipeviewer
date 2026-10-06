// A film from YouTube is a drawn tape until it's played, so nothing loads from YouTube until the student
// asks. Played, it opens into the player over a strip of its chapters drawn to scale. The chapter worth
// waiting for is lit, and a playhead shows how far off it is. The Plumbing intro and Why Unix? both
// show Bell Labs' 1982 film this way.

// Bell Labs' 1982 film, from Brian Kernighan's spelling checker to Lorinda Cherry's pipes. When Brian
// finishes, at 11:05, it skips ahead to 12:45, the end of the bit about files, and it stops at 16:44,
// once Lorinda has finished.
export const BELL_LABS = {
  id: 'XvDZLjaCJuw', start: 314, end: 1004, label: ['THE UNIX SYSTEM', 'BELL LABS · 1982'],
  chapters: [[314, 'Brian: temp files'], [765, 'files'], [793, 'Lorinda: pipes']], goal: 2, skip: [665, 765],
};

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const ORIGIN = 'https://www.youtube-nocookie.com';

export const tape = ({ label: [title, by] }) => `<div class="intro-video"><button type="button" class="tape" title="Play" aria-label="Play the film: ${escape(title)}, ${escape(by)}"><svg viewBox="0 0 320 180" aria-hidden="true">
  <rect class="tape-body" x="4" y="4" width="312" height="172" rx="10"/><rect class="tape-label" x="28" y="18" width="264" height="54" rx="4"/>
  <text class="tape-title" x="160" y="44" text-anchor="middle">${escape(title)}</text><text class="tape-by" x="160" y="62" text-anchor="middle">${escape(by)}</text>
  <rect class="tape-window" x="60" y="92" width="200" height="56" rx="28"/>
  ${[100, 220].map(cx => `<g class="tape-reel"><circle cx="${cx}" cy="120" r="21"/>${[0, 60, 120].map(a => `<rect x="${cx - 2}" y="103" width="4" height="34" transform="rotate(${a} ${cx} 120)"/>`).join('')}<circle class="tape-hub" cx="${cx}" cy="120" r="6"/></g>`).join('')}
  <g class="tape-play"><circle cx="160" cy="120" r="19"/><path d="M154 109v22l18-11z"/></g></svg></button></div>`;

// Swaps the tape button for the player and its chapters.
// A film may skip a stretch, `skip: [from, to]`, which the strip and the playhead leave out. Playing
// into it jumps to its end, and playing on to `end` pauses, but the student can still go back and watch
// the stretch, or play on.
export function playTape(button, { id, start, end, label, chapters, goal, skip: [gap, resume] = [end, end] }) {
  const box = button.closest('.intro-video');
  const shown = (a, b) => b - a - Math.max(0, Math.min(b, resume) - Math.max(a, gap));
  const strip = chapters.map(([from, name], i) => `<span class="chapter${i === goal ? ' goal' : ''}" style="flex-grow: ${shown(from, chapters[i + 1]?.[0] ?? end)}">${escape(name)}</span>`).join('');
  box.innerHTML = `<iframe class="tape-player" src="${ORIGIN}/embed/${id}?start=${start}&autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}" title="${escape(label.join(', '))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    + `<div class="chapters" aria-hidden="true">${strip}<i class="playhead"></i></div>`;
  const player = box.querySelector('.tape-player'), head = box.querySelector('.playhead'), lit = box.querySelector('.chapter.goal');
  // The player reports its time once asked to. Like YouTube's own API, keep asking until it answers,
  // since it may not be listening yet when it first loads.
  let answered = false, last = start;
  const tell = (func, args = []) => player.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), ORIGIN);
  const ask = () => player.isConnected && !answered && player.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'film', channel: 'widget' }), ORIGIN);
  player.addEventListener('load', () => { for (let i = 0; i < 20; i++) setTimeout(ask, i * 500); });
  function hear(event) {
    if (!player.isConnected) { removeEventListener('message', hear); return; }
    if (event.origin !== ORIGIN || event.source !== player.contentWindow) return;
    let time;
    try { time = JSON.parse(event.data)?.info?.currentTime; } catch { return; }
    if (typeof time !== 'number') return;
    answered = true;
    // A few seconds before the skip, the box is marked, so the page can warn of it.
    if (time >= gap - 6) box.classList.add('near-skip');
    if (last < gap && time >= gap && time < resume) tell('seekTo', [resume, true]);
    if (last < end && time >= end) tell('pauseVideo');
    last = time;
    head.style.left = `${Math.min(1, Math.max(0, shown(start, time) / shown(start, end))) * 100}%`;
    head.classList.add('live');
    lit?.classList.toggle('now', time >= chapters[goal][0] && time < end);
  }
  addEventListener('message', hear);
}
