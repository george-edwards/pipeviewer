import { unused, possible } from './helpers.js';

export default {
  names: ['pbcopy'],
  linux: false,
  instead: { linux: { '*': 'use xclip -selection clipboard, or wl-copy on Wayland' } },
  infer({ set, errors }) {
    set(0, possible(0, 'pbcopy reads stdin and puts it on the clipboard.'));
    set(1, unused(1, 'pbcopy puts its input on the clipboard and writes nothing to stdout.'));
    errors();
  },
};
