import { printer } from './helpers.js';

export default {
  names: ['expr'],
  infer(ctx) {
    printer(ctx, 'expr evaluates the expression in its arguments', 'expr writes the result of the expression to stdout.');
  },
};
