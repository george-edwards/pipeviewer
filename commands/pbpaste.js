import { printer } from './helpers.js';

export default {
  names: ['pbpaste'],
  linux: false,
  instead: { linux: { '*': 'use xclip -selection clipboard -o, or wl-paste on Wayland' } },
  infer(ctx) {
    printer(ctx, 'pbpaste reads the clipboard', 'pbpaste writes the clipboard’s contents to stdout.');
  },
};
