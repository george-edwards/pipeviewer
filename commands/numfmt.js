import { unused, possible, scanOptions, fileInput } from './helpers.js';

export default {
  names: ['numfmt'],
  infer({ name, args, set, output, errors }) {
    output('numfmt writes each number reformatted, for example 2000 as 2.0K.'); errors();
    const scan = scanOptions(args, { flags: 'z', values: 'd', longFlags: ['--debug', '--grouping', '--header', '--zero-terminated'],
      longValues: ['--delimiter', '--field', '--format', '--from', '--from-unit', '--header', '--invalid', '--padding', '--round', '--suffix', '--to', '--to-unit'] });
    if (scan.help) set(0, fileInput(name, scan));
    else if (scan.valid) set(0, scan.files.length ? unused(0, 'numfmt converts the numbers in its arguments; it does not read stdin.') : possible(0, 'numfmt reads numbers from stdin when none are given as arguments.'));
  },
};
