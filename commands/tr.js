import { unused, possible, scanOptions } from './helpers.js';

export default {
  names: ['tr'],
  infer({ args, set, output, errors }) {
    output('tr writes its input with characters translated, squeezed or deleted.'); errors();
    // tr takes character sets, never file names, so stdin is its only input.
    if (scanOptions(args, {}).help) set(0, unused(0, 'tr prints help or version information without reading stdin.'));
    else set(0, possible(0, 'tr reads stdin; its arguments are character sets, not files.'));
  },
};
