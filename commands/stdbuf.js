import { unused, scanOptions, runsCommand } from './helpers.js';

export default {
  names: ['stdbuf'],
  infer(ctx) {
    const scan = scanOptions(ctx.args, { values: 'ioe', longValues: ['--input', '--output', '--error'], stopAtOperand: true });
    if (scan.help) {
      ctx.set(0, unused(0, 'stdbuf prints help or version information without reading stdin.'));
      ctx.output('stdbuf prints help or version information to stdout.');
    } else if (scan.valid && scan.files.length) runsCommand(ctx, scan.files);
  },
};
