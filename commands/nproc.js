import { printer } from './helpers.js';

export default {
  names: ['nproc'],
  infer(ctx) {
    printer(ctx, 'nproc counts processors', 'nproc writes the number of available processing units.');
  },
};
