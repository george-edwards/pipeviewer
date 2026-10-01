import { fileAction, bsd } from './helpers.js';

// macOS ships the BSD link: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/ln/ln.c
const macos = bsd('');

export default {
  names: ['link'],
  infer(ctx) {
    fileAction(ctx, ctx.platform === 'macos' ? macos : {});
  },
};
