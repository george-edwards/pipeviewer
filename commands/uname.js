import { printer } from './helpers.js';

export default {
  names: ['uname'],
  infer(ctx) {
    printer(ctx, 'uname reports on the system', 'uname writes system information, such as the kernel name and release.');
  },
};
