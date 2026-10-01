import { fileAction } from './helpers.js';

export default {
  names: ['chown'],
  infer(ctx) {
    fileAction(ctx, { flags: 'cfvhRHLP', longFlags: ['--changes', '--silent', '--quiet', '--verbose', '--dereference', '--no-dereference', '--no-preserve-root', '--preserve-root', '--recursive'],
      longValues: ['--from', '--reference'] }, { verbose: ['-c', '--changes', '-v', '--verbose'], reports: 'reports the files whose owner it changes' });
  },
};
