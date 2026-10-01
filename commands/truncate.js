import { fileAction, bsd } from './helpers.js';

// macOS ships the BSD truncate: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/truncate/truncate.c
const macos = bsd('cr:s:');

export default {
  names: ['truncate'],
  infer(ctx) {
    fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'co', values: 'rs', longFlags: ['--no-create', '--io-blocks'], longValues: ['--reference', '--size'] });
  },
};
