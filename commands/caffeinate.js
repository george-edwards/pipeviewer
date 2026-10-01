import { unused, scanOptions, runsCommand } from './helpers.js';

export default {
  names: ['caffeinate'],
  linux: false,
  instead: { linux: { '*': 'use systemd-inhibit' } },
  // caffeinate [-dimsu] [-t seconds] [-w pid] [command …] keeps the Mac awake.
  infer(ctx) {
    const scan = scanOptions(ctx.args, { flags: 'dimsu', values: 'tw', stopAtOperand: true });
    if (!scan.valid) return;
    if (scan.files.length) { runsCommand(ctx, scan.files); return; }
    ctx.set(0, unused(0, 'caffeinate with no command just keeps the Mac awake; it does not read stdin.'));
    ctx.set(1, unused(1, 'caffeinate with no command writes nothing to stdout.'));
    ctx.errors();
  },
};
