import { possible, fileAction, bsd } from './helpers.js';

// macOS ships the BSD cp: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/cp/cp.c
const macos = bsd('HLPRacfilNnprSsvXx');

export default {
  names: ['cp'],
  infer(ctx) {
    const scan = fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'abdfiHlLnPpRrsTuvxZ', values: 'St', longFlags: ['--archive', '--attributes-only', '--backup', '--copy-contents', '--force', '--interactive', '--link', '--dereference', '--no-clobber', '--no-dereference', '--preserve', '--parents', '--recursive', '--reflink', '--remove-destination', '--strip-trailing-slashes', '--symbolic-link', '--no-target-directory', '--update', '--verbose', '--one-file-system', '--context', '--debug'],
      longValues: ['--backup', '--preserve', '--no-preserve', '--reflink', '--sparse', '--suffix', '--target-directory', '--context'] }, { verbose: ['-v', '--verbose', '--debug'], reports: 'reports each file it copies' });
    if (scan.valid && ['-i', '--interactive'].some(key => scan.options.has(key))) ctx.set(0, possible(0, 'cp -i asks before overwriting a file and reads the answer from stdin.'));
  },
};
