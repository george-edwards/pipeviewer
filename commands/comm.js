import { scanOptions, fileInput, bsd } from './helpers.js';

// macOS ships the BSD comm: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/comm/comm.c
const macos = bsd('123i');

export default {
  names: ['comm'],
  // comm compares exactly two files, either of which may be “-” for stdin.
  infer({ name, args, set, output, errors, platform }) {
    output('comm writes three columns: lines only in the first file, lines only in the second, and lines in both.'); errors();
    const scan = scanOptions(args, platform === 'macos' ? macos : { flags: '123z', longFlags: ['--check-order', '--nocheck-order', '--total', '--zero-terminated'], longValues: ['--output-delimiter'] });
    if (scan.help || (scan.valid && scan.files.length === 2)) set(0, fileInput(name, scan));
  },
};
