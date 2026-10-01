import { fileAction } from './helpers.js';

export default {
  names: ['chgrp'],
  infer(ctx) {
    fileAction(ctx, { flags: 'cfvhRHLP', longFlags: ['--changes', '--silent', '--quiet', '--verbose', '--dereference', '--no-dereference', '--no-preserve-root', '--preserve-root', '--recursive'],
      longValues: ['--reference'] }, { verbose: ['-c', '--changes', '-v', '--verbose'], reports: 'reports the files whose group it changes' });
  },
};
