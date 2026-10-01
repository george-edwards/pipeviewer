import { printer } from './helpers.js';

export default {
  names: ['dirname'],
  infer(ctx) {
    printer(ctx, 'dirname works on the names in its arguments', 'dirname writes the directory part of each name.');
  },
};
