import { usage, unused, stdoutPath, scanOptions, bsd } from './helpers.js';

// macOS ships the BSD time: https://github.com/apple-oss-distributions/shell_cmds/blob/shell_cmds-326/time/time.c
const macos = bsd('ahlo:p');

export default {
  names: ['/usr/bin/time'],
  infer({ args, set, output, errors, infer, platform }) {
    errors();
    const scan = scanOptions(args, platform === 'macos' ? macos : { flags: 'apvqV', values: 'fo', longFlags: ['--append', '--portability', '--verbose', '--quiet'],
      longValues: ['--format', '--output'], stopAtOperand: true });
    if (scan.help || (args.length === 1 && args[0].value === '-V')) {
      set(0, unused(0, 'time prints help or version information without reading stdin.'));
      output('time prints help or version information to stdout.');
    } else if (scan.valid && scan.files.length > 0) {
      const child = infer(scan.files);
      for (const fd of [0, 1]) {
        const inferred = child.fds[fd];
        set(fd, usage(inferred.state, inferred.label, `/usr/bin/time runs ${child.name}. ${inferred.reason}`));
      }
      const outputFile = scan.options.get('-o') ?? scan.options.get('--output');
      if (outputFile && stdoutPath(outputFile)) {
        output('/usr/bin/time sends timing data to a path that refers to stdout; the child may also write stdout.');
      }
      set(2, usage('possible', outputFile === undefined ? 'timing + errors' : 'may write', '/usr/bin/time writes timing data to stderr by default; the child or time itself may also write diagnostics. With -o, timing data goes to a file.'));
    } else if (scan.valid && scan.files.length === 0) {
      set(0, unused(0, 'time has no command to run and does not read stdin.'));
      set(1, unused(1, 'time has no command to run; missing-command diagnostics go to stderr.'));
    }
  },
};
