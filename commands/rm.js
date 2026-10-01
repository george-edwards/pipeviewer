import { possible, fileAction } from './helpers.js';

export default {
  names: ['rm'],
  infer(ctx) {
    const scan = fileAction(ctx, { flags: 'fiIrRdv', longFlags: ['--force', '--interactive', '--one-file-system', '--no-preserve-root', '--preserve-root', '--recursive', '--dir', '--verbose'],
      longValues: ['--interactive', '--preserve-root'] }, { verbose: ['-v', '--verbose'], reports: 'reports each file it removes' });
    if (!scan.valid || scan.help) return;
    const interactive = scan.options.get('--interactive');
    if (['-i', '-I'].some(key => scan.options.has(key)) || (interactive !== undefined && interactive !== 'never')) {
      ctx.set(0, possible(0, 'rm -i and -I ask before removing and read the answers from stdin.'));
    } else if (!scan.options.has('-f') && !scan.options.has('--force')) {
      // rm only asks about write-protected files when stdin is a terminal; from a pipe it removes them.
      ctx.set(0, possible(0, 'rm asks before removing a write-protected file when stdin is a terminal, and reads the answer from it.'));
    }
  },
};
