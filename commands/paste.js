import { filterInput } from './helpers.js';

export default {
  names: ['paste'],
  infer(ctx) {
    filterInput(ctx, { flags: 'sz', values: 'd', longFlags: ['--serial', '--zero-terminated'], longValues: ['--delimiters'] });
  },
};
