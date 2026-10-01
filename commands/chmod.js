import { possible, fileAction, bsd } from './helpers.js';

// macOS ships the BSD chmod: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/chmod/chmod.c
const macos = bsd('ACEHILNPRVXafghinorstuvwx');

export default {
  names: ['chmod'],
  infer(ctx) {
    const scan = fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'cfvR', longFlags: ['--changes', '--silent', '--quiet', '--verbose', '--no-preserve-root', '--preserve-root', '--recursive'],
      longValues: ['--reference'] }, { verbose: ['-c', '--changes', '-v', '--verbose'], reports: 'reports the files whose mode it changes' });
    if (ctx.platform === 'macos' && scan.valid && scan.options.has('-E')) ctx.set(0, possible(0, 'chmod -E reads ACL entries from stdin.'));
  },
};
