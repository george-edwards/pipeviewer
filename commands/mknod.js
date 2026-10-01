import { fileAction, bsd } from './helpers.js';

// macOS ships the BSD mknod: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/mknod/mknod.c
const macos = bsd('rRF:g:m:');

export default {
  names: ['mknod'],
  infer(ctx) {
    fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'Z', values: 'm', longFlags: ['--context'], longValues: ['--mode', '--context'] });
  },
};
