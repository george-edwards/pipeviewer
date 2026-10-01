import { printer } from './helpers.js';

export default {
  names: ['seq'],
  infer(ctx) {
    printer(ctx, 'seq generates numbers from its arguments', 'seq writes the sequence to stdout, one number per line.');
  },
};
