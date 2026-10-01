import { unused, scanOptions, runsCommand, bsd } from './helpers.js';

// macOS ships the BSD env: https://github.com/apple-oss-distributions/shell_cmds/blob/shell_cmds-326/env/env.c
const macos = { ...bsd('0C:iP:S:u:v'), stopAtOperand: true };

export default {
  names: ['env'],
  infer(ctx) {
    const { args, set, output, errors } = ctx;
    const scan = scanOptions(args, ctx.platform === 'macos' ? macos : { flags: 'i0v', values: 'uCS', longFlags: ['--ignore-environment', '--null', '--block-signal', '--default-signal', '--ignore-signal', '--list-signal-handling', '--debug'],
      longValues: ['--unset', '--chdir', '--split-string', '--block-signal', '--default-signal', '--ignore-signal'], stopAtOperand: true });
    // -S splits a string into a command line, which is not parsed here.
    if (!scan.valid || scan.options.has('-S') || scan.options.has('--split-string')) return;
    // A lone “-” acts like -i; NAME=VALUE words set variables before the command.
    const words = scan.files.slice(scan.files[0]?.value === '-' ? 1 : 0);
    const start = words.findIndex(word => !/^[^=]+=/.test(word.value));
    const command = start === -1 ? [] : words.slice(start);
    if (command.length) { runsCommand(ctx, command); return; }
    set(0, unused(0, 'env with no command prints the environment; it does not read stdin.'));
    output('env with no command writes each environment variable to stdout.'); errors();
  },
};
