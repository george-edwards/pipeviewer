import { scanOptions, fileInput, bsd } from './helpers.js';

// macOS ships the BSD join: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/join/join.c
const macos = bsd('a:e:j:1:2:o:t:v:');

export default {
  names: ['join'],
  // join compares exactly two files, either of which may be “-” for stdin.
  infer({ name, args, set, output, errors, platform }) {
    output('join writes a line for each pair of input lines with identical join fields.'); errors();
    const scan = scanOptions(args, platform === 'macos' ? macos : { flags: 'iz', values: 'aejotv12', longFlags: ['--ignore-case', '--check-order', '--nocheck-order', '--header', '--zero-terminated'] });
    if (scan.help || (scan.valid && scan.files.length === 2)) set(0, fileInput(name, scan));
  },
};
