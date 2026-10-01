import { possible, fileAction } from './helpers.js';

export default {
  names: ['mv'],
  infer(ctx) {
    const scan = fileAction(ctx, { flags: 'bfinTuvZ', values: 'St', longFlags: ['--backup', '--force', '--interactive', '--no-clobber', '--strip-trailing-slashes', '--no-target-directory', '--update', '--verbose', '--context'],
      longValues: ['--backup', '--suffix', '--target-directory'] }, { verbose: ['-v', '--verbose'], reports: 'reports each file it moves' });
    const has = (...keys) => keys.some(key => scan.options.has(key));
    if (!scan.valid || scan.help) return;
    if (has('-i', '--interactive')) ctx.set(0, possible(0, 'mv -i asks before overwriting a file and reads the answer from stdin.'));
    // Without -f or -n, mv asks before replacing a file it cannot write, but only when stdin is a terminal.
    else if (!has('-f', '--force', '-n', '--no-clobber')) ctx.set(0, possible(0, 'mv asks before replacing a destination it cannot write when stdin is a terminal, and reads the answer from it.'));
  },
};
