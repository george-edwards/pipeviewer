import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD unexpand: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/unexpand/unexpand.c
const macos = bsd('at:');

export default {
  names: ['unexpand'],
  infer(ctx) {
    // Obsolete width forms such as -72 are accepted as digit flags.
    filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'a0123456789', values: 't', longFlags: ['--all', '--first-only'], longValues: ['--tabs'] }, { dashMeansStdin: ctx.platform !== 'macos', writes: 'unexpand writes its input with runs of spaces converted to tabs.' });
  },
};
