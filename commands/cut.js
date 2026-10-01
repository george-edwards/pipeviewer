import { filterInput } from './helpers.js';

export default {
  names: ['cut'],
  infer(ctx) {
    filterInput(ctx, { flags: 'Fnswz', values: 'bcfdO', longFlags: ['--only-delimited', '--zero-terminated', '--no-partial'], longValues: ['--bytes', '--characters', '--fields', '--delimiter', '--output-delimiter', '--whitespace-delimited'] });
  },
};
