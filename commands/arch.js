import { printer } from './helpers.js';

export default {
  names: ['arch'],
  infer(ctx) {
    printer(ctx, 'arch reports on the machine', 'arch writes the machine hardware name to stdout.');
  },
};
