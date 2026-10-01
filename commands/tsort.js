import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD tsort: https://github.com/apple-oss-distributions/misc_cmds/blob/misc_cmds-45/tsort/tsort.c
const macos = bsd('dlq');

export default {
  names: ['tsort'],
  infer(ctx) {
    filterInput(ctx, ctx.platform === 'macos' ? macos : {}, { maxFiles: 1, dashMeansStdin: ctx.platform !== 'macos', writes: 'tsort writes the items in an order consistent with the pairs it reads.' });
  },
};
