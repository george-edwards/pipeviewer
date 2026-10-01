import { fileAction, bsd } from './helpers.js';

// macOS ships the BSD mkfifo: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/mkfifo/mkfifo.c
const macos = bsd('m:');

export default {
  names: ['mkfifo'],
  infer(ctx) {
    fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'Z', values: 'm', longFlags: ['--context'], longValues: ['--mode', '--context'] });
  },
};
