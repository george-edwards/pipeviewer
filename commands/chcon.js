import { fileAction } from './helpers.js';

export default {
  names: ['chcon'],
  macos: false,
  instead: { macos: { '*': 'macOS has no SELinux' } },
  infer(ctx) {
    fileAction(ctx, { flags: 'hRvHLP', values: 'urtl', longFlags: ['--dereference', '--no-dereference', '--no-preserve-root', '--preserve-root', '--recursive', '--verbose'],
      longValues: ['--user', '--role', '--type', '--range', '--reference'] }, { verbose: ['-v', '--verbose'], reports: 'reports each file it relabels' });
  },
};
