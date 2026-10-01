import { printer } from './helpers.js';

export default {
  names: ['readlink'],
  infer(ctx) {
    printer(ctx, 'readlink resolves the links named in its arguments', 'readlink writes each link target, or the resolved path with -f.');
  },
};
