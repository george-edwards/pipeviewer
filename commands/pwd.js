import { printer } from './helpers.js';

export default {
  names: ['pwd'],
  infer(ctx) {
    printer(ctx, 'pwd reports the working directory', 'pwd writes the working directory to stdout.');
  },
};
