import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD cut: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/cut/cut.c
const macos = bsd('b:c:d:f:snw');

export default {
  names: ['cut'],
  infer(ctx) {
    filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'Fnswz', values: 'bcfdO', longFlags: ['--only-delimited', '--zero-terminated', '--no-partial'], longValues: ['--bytes', '--characters', '--fields', '--delimiter', '--output-delimiter', '--whitespace-delimited'] });
  },
};
