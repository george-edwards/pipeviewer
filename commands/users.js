import { printer } from './helpers.js';

export default {
  names: ['users'],
  infer(ctx) {
    printer(ctx, 'users reads the login records', 'users writes the names of logged-in users on one line.');
  },
};
