import { printer } from './helpers.js';

export default {
  names: ['id'],
  infer(ctx) {
    printer(ctx, 'id looks up users and groups', 'id writes user and group IDs and names to stdout.');
  },
};
