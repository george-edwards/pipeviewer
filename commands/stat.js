import { printer } from './helpers.js';

export default {
  names: ['stat'],
  infer(ctx) {
    printer(ctx, 'stat examines the files named in its arguments', 'stat writes file details to stdout.');
  },
};
