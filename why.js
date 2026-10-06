// Why Unix?: four short films. Two are drawn, then Bell Labs' own from 1982, then one on installing
// software. The drawn ones are in whyscenes.js; Bell Labs' waits as a tape, as it does in the Plumbing
// intro.
import { playScenes } from './whyscenes.js';
import { BELL_LABS, tape, playTape } from './tape.js';

const bell = document.querySelector('#scene-bell .bell-film');
bell.innerHTML = tape(BELL_LABS);
bell.addEventListener('click', event => {
  const button = event.target.closest('.tape');
  if (button) playTape(button, BELL_LABS);
});

// The drawn films are set up the first time the page is shown, and each plays when asked.
export function showWhy() { playScenes(); }
