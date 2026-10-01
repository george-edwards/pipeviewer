import { printer } from './helpers.js';

export default {
  names: ['printenv'],
  infer(ctx) {
    printer(ctx, 'printenv reports its environment', 'printenv writes environment variables to stdout.');
  },
};
