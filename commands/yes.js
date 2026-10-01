import { printer } from './helpers.js';

export default {
  names: ['yes'],
  infer(ctx) {
    printer(ctx, 'yes repeats its arguments, or y', 'yes writes the same line to stdout until the reader exits or it is killed.');
  },
};
