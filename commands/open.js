import { unused, possible } from './helpers.js';

export default {
  names: ['open'],
  linux: false,
  instead: { linux: { '*': 'use xdg-open' } },
  infer({ args, set, errors }) {
    errors();
    // open -f reads stdin into a new TextEdit document; otherwise it hands its arguments to apps.
    if (args.some(arg => /^-[a-zA-Z]*f/.test(arg.value) && !arg.value.startsWith('--'))) set(0, possible(0, 'open -f reads stdin and opens it in TextEdit.'));
    else set(0, unused(0, 'open asks Launch Services to open its arguments; it does not read stdin.'));
    set(1, unused(1, 'open writes nothing to stdout; the apps it starts are not connected to this shell.'));
  },
};
