import { unused, scanOptions, runsCommand } from './helpers.js';

export default {
  names: ['runcon'],
  macos: false,
  instead: { macos: { '*': 'macOS has no SELinux' } },
  infer(ctx) {
    const { set, output, errors } = ctx;
    // runcon CONTEXT COMMAND…, or runcon with -c, -t, -u, -r or -l and then COMMAND….
    const scan = scanOptions(ctx.args, { flags: 'c', values: 'turl', longFlags: ['--compute'], longValues: ['--type', '--user', '--role', '--range'], stopAtOperand: true });
    if (!scan.valid) return;
    const command = scan.options.size ? scan.files : scan.files.slice(1);
    if (command.length) { runsCommand(ctx, command); return; }
    if (scan.files.length) return;
    set(0, unused(0, 'runcon with no arguments prints its security context; it does not read stdin.'));
    output('runcon with no arguments prints the current security context.'); errors();
  },
};
