import { printer } from './helpers.js';

export default {
  names: ['pinky'],
  infer(ctx) {
    printer(ctx, 'pinky reads the login records', 'pinky writes details about users, like a lightweight finger.');
  },
};
