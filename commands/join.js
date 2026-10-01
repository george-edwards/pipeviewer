import { scanOptions, fileInput } from './helpers.js';

export default {
  names: ['join'],
  // join compares exactly two files, either of which may be “-” for stdin.
  infer({ name, args, set, output, errors }) {
    output('join writes a line for each pair of input lines with identical join fields.'); errors();
    const scan = scanOptions(args, { flags: 'iz', values: 'aejotv12', longFlags: ['--ignore-case', '--check-order', '--nocheck-order', '--header', '--zero-terminated'] });
    if (scan.help || (scan.valid && scan.files.length === 2)) set(0, fileInput(name, scan));
  },
};
