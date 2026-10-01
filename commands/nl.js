import { filterInput } from './helpers.js';

export default {
  names: ['nl'],
  infer(ctx) {
    filterInput(ctx, { flags: 'p', values: 'bdfhilnsvw', longFlags: ['--no-renumber'],
      longValues: ['--body-numbering', '--section-delimiter', '--footer-numbering', '--header-numbering', '--line-increment', '--join-blank-lines', '--number-format', '--number-separator', '--starting-line-number', '--number-width'] }, { writes: 'nl writes each line with a line number added.' });
  },
};
