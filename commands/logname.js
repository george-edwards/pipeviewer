import { printer } from './helpers.js';

export default {
  names: ['logname'],
  infer(ctx) {
    printer(ctx, 'logname looks up the login name', 'logname writes the login name to stdout.');
  },
};
