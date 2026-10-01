import { unused, possible, scanOptions, bsd } from './helpers.js';

// macOS ships the BSD tr: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/tr/tr.c
const macos = bsd('Ccdsu');

export default {
  names: ['tr'],
  infer({ args, set, output, errors, platform }) {
    output('tr writes its input with characters translated, squeezed or deleted.'); errors();
    // tr takes character sets, never file names, so stdin is its only input.
    if (scanOptions(args, platform === 'macos' ? macos : {}).help) set(0, unused(0, 'tr prints help or version information without reading stdin.'));
    else set(0, possible(0, 'tr reads stdin; its arguments are character sets, not files.'));
  },
};
