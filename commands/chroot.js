import { possible, scanOptions, runsCommand } from './helpers.js';

export default {
  names: ['chroot'],
  infer(ctx) {
    const { set, output, errors } = ctx;
    // chroot NEWROOT [COMMAND…]: with no command it runs an interactive shell.
    const scan = scanOptions(ctx.args, { longFlags: ['--skip-chdir'], longValues: ['--groups', '--userspec'], stopAtOperand: true });
    if (!scan.valid || !scan.files.length) return;
    if (scan.files.length > 1) { runsCommand(ctx, scan.files.slice(1)); return; }
    set(0, possible(0, 'chroot with no command starts an interactive shell, which reads stdin.'));
    output('chroot with no command starts an interactive shell, which writes to stdout.'); errors();
  },
};
