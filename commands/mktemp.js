import { printer } from './helpers.js';

export default {
  names: ['mktemp'],
  infer(ctx) {
    printer(ctx, 'mktemp creates a file or directory from its template', 'mktemp writes the name of the file or directory it creates.');
  },
};
