import { possible, fileAction, bsd } from './helpers.js';

// macOS ships the BSD mv: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/mv/mv.c
const macos = bsd('fhinv');

export default {
  names: ['mv'],
  infer(ctx) {
    const scan = fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'bfinTuvZ', values: 'St', longFlags: ['--backup', '--force', '--interactive', '--no-clobber', '--strip-trailing-slashes', '--no-target-directory', '--update', '--verbose', '--context'],
      longValues: ['--backup', '--suffix', '--target-directory'] }, { verbose: ['-v', '--verbose'], reports: 'reports each file it moves' });
    const has = (...keys) => keys.some(key => scan.options.has(key));
    if (!scan.valid || scan.help) return;
    if (has('-i', '--interactive')) ctx.set(0, possible(0, 'mv -i asks before overwriting a file and reads the answer from stdin.'));
    // Without -f or -n, mv asks before replacing a file it cannot write, but only when stdin is a terminal.
    else if (!has('-f', '--force', '-n', '--no-clobber')) ctx.set(0, possible(0, 'mv asks before replacing a destination it cannot write when stdin is a terminal, and reads the answer from it.'));
  },
};
