import { unused, possible, scanOptions } from './helpers.js';

export default {
  names: ['tee'],
  infer({ args, set, output, errors }) {
    errors();
    if (scanOptions(args, { flags: 'aip', longFlags: ['--append', '--ignore-interrupts', '--output-error'], longValues: ['--output-error'] }).help) {
      set(0, unused(0, 'tee prints help or version information without reading stdin.'));
      output('tee prints help or version information to stdout.');
    } else {
      set(0, possible(0, 'tee reads stdin and copies it to stdout and to each named file.'));
      output('tee copies its input to stdout as well as to the named files.');
    }
  },
};
