import { fileAction, bsd } from './helpers.js';

// macOS ships the BSD rmdir: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/rmdir/rmdir.c
const macos = bsd('pv');

export default {
  names: ['rmdir'],
  infer(ctx) {
    fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'pv', longFlags: ['--ignore-fail-on-non-empty', '--parents', '--verbose'] }, { verbose: ['-v', '--verbose'], reports: 'reports each directory it removes' });
  },
};
