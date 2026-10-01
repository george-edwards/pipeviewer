import { printer } from './helpers.js';

export default {
  names: ['basename'],
  infer(ctx) {
    printer(ctx, 'basename works on the names in its arguments', 'basename writes each name with its directory and any suffix removed.');
  },
};
