import { printer } from './helpers.js';

export default {
  names: ['df'],
  infer(ctx) {
    printer(ctx, 'df reports on mounted file systems', 'df writes a table of file system usage to stdout.');
  },
};
