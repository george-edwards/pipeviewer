import { printer } from './helpers.js';

export default {
  names: ['whoami'],
  infer(ctx) {
    printer(ctx, 'whoami looks up the effective user', 'whoami writes the effective user name to stdout.');
  },
};
