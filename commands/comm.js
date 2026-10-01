import { scanOptions, fileInput } from './helpers.js';

export default {
  names: ['comm'],
  // comm compares exactly two files, either of which may be “-” for stdin.
  infer({ name, args, set, output, errors }) {
    output('comm writes three columns: lines only in the first file, lines only in the second, and lines in both.'); errors();
    const scan = scanOptions(args, { flags: '123z', longFlags: ['--check-order', '--nocheck-order', '--total', '--zero-terminated'], longValues: ['--output-delimiter'] });
    if (scan.help || (scan.valid && scan.files.length === 2)) set(0, fileInput(name, scan));
  },
};
