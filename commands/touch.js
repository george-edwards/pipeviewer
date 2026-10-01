import { fileAction, bsd } from './helpers.js';

// macOS ships the BSD touch: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/touch/touch.c
const macos = bsd('A:acd:fhmr:t:');

export default {
  names: ['touch'],
  infer(ctx) {
    fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'acfhm', values: 'drt', longFlags: ['--no-create', '--no-dereference'], longValues: ['--date', '--reference', '--time'] });
  },
};
