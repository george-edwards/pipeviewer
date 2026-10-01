import { unused, possible, scanOptions, bsd } from './helpers.js';

// macOS ships the BSD tee: https://github.com/apple-oss-distributions/shell_cmds/blob/shell_cmds-326/tee/tee.c
const macos = bsd('ai');

export default {
  names: ['tee'],
  infer({ args, set, output, errors, platform }) {
    errors();
    if (scanOptions(args, platform === 'macos' ? macos : { flags: 'aip', longFlags: ['--append', '--ignore-interrupts', '--output-error'], longValues: ['--output-error'] }).help) {
      set(0, unused(0, 'tee prints help or version information without reading stdin.'));
      output('tee prints help or version information to stdout.');
    } else {
      set(0, possible(0, 'tee reads stdin and copies it to stdout and to each named file.'));
      output('tee copies its input to stdout as well as to the named files.');
    }
  },
};
