import { fileAction, bsd } from './helpers.js';

// macOS ships the BSD chown: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/chown/chown.c
const macos = bsd('HLPRfhnvx');

export default {
  names: ['chown'],
  infer(ctx) {
    fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'cfvhRHLP', longFlags: ['--changes', '--silent', '--quiet', '--verbose', '--dereference', '--no-dereference', '--no-preserve-root', '--preserve-root', '--recursive'],
      longValues: ['--from', '--reference'] }, { verbose: ['-c', '--changes', '-v', '--verbose'], reports: 'reports the files whose owner it changes' });
  },
};
