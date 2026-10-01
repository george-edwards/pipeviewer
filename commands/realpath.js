import { printer } from './helpers.js';

export default {
  names: ['realpath'],
  infer(ctx) {
    printer(ctx, 'realpath resolves the paths in its arguments', 'realpath writes each resolved absolute path.');
  },
};
