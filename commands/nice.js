import { unused, scanOptions, runsCommand } from './helpers.js';

export default {
  names: ['nice'],
  infer(ctx) {
    const { args, set, output, errors } = ctx;
    // Digit flags accept the obsolete form nice -10.
    const scan = scanOptions(args, { values: 'n', longValues: ['--adjustment'], flags: '0123456789', stopAtOperand: true });
    if (!scan.valid) return;
    if (scan.files.length) { runsCommand(ctx, scan.files); return; }
    set(0, unused(0, 'nice with no command prints its niceness; it does not read stdin.'));
    output('nice with no command prints the current niceness.'); errors();
  },
};
