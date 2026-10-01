import { printer } from './helpers.js';

export default {
  names: ['who'],
  infer(ctx) {
    printer(ctx, 'who reads the login records', 'who writes a line for each logged-in user.');
  },
};
