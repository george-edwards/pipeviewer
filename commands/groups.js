import { printer } from './helpers.js';

export default {
  names: ['groups'],
  infer(ctx) {
    printer(ctx, 'groups looks up group memberships', 'groups writes the groups of each user to stdout.');
  },
};
