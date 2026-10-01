import { fileAction } from './helpers.js';

export default {
  names: ['chmod'],
  infer(ctx) {
    fileAction(ctx, { flags: 'cfvR', longFlags: ['--changes', '--silent', '--quiet', '--verbose', '--no-preserve-root', '--preserve-root', '--recursive'],
      longValues: ['--reference'] }, { verbose: ['-c', '--changes', '-v', '--verbose'], reports: 'reports the files whose mode it changes' });
  },
};
