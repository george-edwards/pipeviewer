import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD rev: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/rev/rev.c
const macos = bsd('');

export default {
  names: ['rev'],
  // rev treats “-” as a file name, not stdin.
  infer(ctx) {
    filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: '0', longFlags: ['--zero'] }, { dashMeansStdin: false });
  },
};
