import { fileAction, bsd } from './helpers.js';

// macOS ships the BSD mkdir: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/mkdir/mkdir.c
const macos = bsd('m:pv');

export default {
  names: ['mkdir'],
  infer(ctx) {
    fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'pvZ', values: 'm', longFlags: ['--parents', '--verbose', '--context'], longValues: ['--mode', '--context'] }, { verbose: ['-v', '--verbose'], reports: 'reports each directory it creates' });
  },
};
