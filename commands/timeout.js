import { unused, scanOptions, runsCommand } from './helpers.js';

export default {
  names: ['timeout'],
  infer(ctx) {
    // timeout DURATION COMMAND…
    const scan = scanOptions(ctx.args, { flags: 'v', values: 'ks', longFlags: ['--preserve-status', '--foreground', '--verbose'], longValues: ['--kill-after', '--signal'], stopAtOperand: true });
    if (scan.help) {
      ctx.set(0, unused(0, 'timeout prints help or version information without reading stdin.'));
      ctx.output('timeout prints help or version information to stdout.');
    } else if (scan.valid && scan.files.length > 1) runsCommand(ctx, scan.files.slice(1));
  },
};
