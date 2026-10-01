import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD expand: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/expand/expand.c
const macos = bsd('t:');

export default {
  names: ['expand'],
  infer(ctx) {
    // Obsolete width forms such as -72 are accepted as digit flags.
    filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'i0123456789', values: 't', longFlags: ['--initial'], longValues: ['--tabs'] }, { dashMeansStdin: ctx.platform !== 'macos', writes: 'expand writes its input with tabs converted to spaces.' });
  },
};
