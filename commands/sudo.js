import { possible, unused, scanOptions, runsCommand } from './helpers.js';

// sudo 1.9, as on Ubuntu and macOS. Options end at the command's name.
const spec = {
  flags: 'AbEHiKklnPSsVv', values: 'CDghpRTUur', stopAtOperand: true,
  longFlags: ['--askpass', '--background', '--set-home', '--login', '--remove-timestamp', '--reset-timestamp', '--list', '--non-interactive', '--preserve-groups', '--stdin', '--shell', '--validate'],
  longValues: ['--close-from', '--chdir', '--group', '--host', '--prompt', '--chroot', '--other-user', '--user', '--command-timeout', '--role', '--type'],
};

export default {
  names: ['sudo'],
  infer(ctx) {
    const { args, set, output, errors } = ctx;
    // --preserve-env takes an optional list, attached with =.
    const scan = scanOptions(args.filter(arg => !/^--preserve-env(?:=.*)?$/.test(arg.value)), spec);
    const has = (...keys) => keys.some(key => scan.options.has(key));
    if (scan.help || (args.length === 1 && ['-h', '-V'].includes(args[0].value))) {
      set(0, unused(0, 'sudo prints help or version information without reading stdin.'));
      output('sudo prints help or version information to stdout.'); errors();
      return;
    }
    if (!scan.valid) return;
    const fromStdin = has('-S', '--stdin');
    const password = fromStdin ? 'With -S, sudo first reads the password from stdin.' : 'sudo asks for a password on the terminal itself, not through stdin, so a pipe or redirect cannot answer it.';
    if (scan.files.length) {
      runsCommand(ctx, scan.files, { 0: password, ...(has('-b', '--background') ? { 1: 'With -b, the command runs in the background.' } : {}) });
      if (fromStdin) set(0, possible(0, `sudo -S reads the password from stdin before ${scan.files[0].value} runs, and ${scan.files[0].value} inherits the rest.`));
      return;
    }
    errors();
    // With no command, -i and -s start a shell, which reads its commands from stdin.
    if (has('-i', '--login', '-s', '--shell')) {
      set(0, possible(0, 'sudo -i or -s with no command starts a shell, which reads commands from stdin.'));
      output('The shell sudo starts writes its output to stdout.');
      return;
    }
    set(0, fromStdin ? possible(0, password) : unused(0, `${password} It runs no command here.`));
    if (has('-l', '--list')) output('sudo -l lists the commands the user may run.');
    else if (has('-v', '--validate', '-k', '--reset-timestamp', '-K', '--remove-timestamp')) set(1, unused(1, 'sudo -v, -k and -K only refresh or clear the cached password, and print nothing.'));
  },
};
