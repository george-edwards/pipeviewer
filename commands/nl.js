import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD nl: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/nl/nl.c
const macos = bsd('pb:d:f:h:i:l:n:s:v:w:');

export default {
  names: ['nl'],
  infer(ctx) {
    filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'p', values: 'bdfhilnsvw', longFlags: ['--no-renumber'],
      longValues: ['--body-numbering', '--section-delimiter', '--footer-numbering', '--header-numbering', '--line-increment', '--join-blank-lines', '--number-format', '--number-separator', '--starting-line-number', '--number-width'] }, { writes: 'nl writes each line with a line number added.' });
  },
};
