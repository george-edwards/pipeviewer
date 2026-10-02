import { unused, possible, scanOptions, bsd, descriptorPath, stdoutPath } from './helpers.js';

// macOS ships the BSD tee: https://github.com/apple-oss-distributions/shell_cmds/blob/shell_cmds-326/tee/tee.c
const macos = bsd('ai');

export default {
  names: ['tee'],
  infer({ args, set, output, errors, writes, platform }) {
    errors();
    const scan = scanOptions(args, platform === 'macos' ? macos : { flags: 'aip', longFlags: ['--append', '--ignore-interrupts', '--output-error'], longValues: ['--output-error'] });
    if (scan.help) {
      set(0, unused(0, 'tee prints help or version information without reading stdin.'));
      output('tee prints help or version information to stdout.');
    } else {
      set(0, possible(0, 'tee reads stdin and copies it to stdout and to each named file.'));
      output('tee copies its input to stdout as well as to the named files.');
      // tee opens each named file itself. Process substitutions, descriptor paths, /dev/stderr and
      // /dev/tty name something already drawn or outside the map, and a variable cannot be resolved.
      const files = scan.valid && !scan.options.has('--help') && !scan.options.has('--version') ? scan.files.filter(file => !file.dynamic && !file.procsub && file.value !== '-'
        && !descriptorPath(file) && !stdoutPath(file.value) && !['/dev/stderr', '/dev/tty'].includes(file.value)) : [];
      if (files.length) writes(files, scan.options.has('-a') || scan.options.has('--append') ? 'append' : 'write');
    }
  },
};
