import { printer } from './helpers.js';

export default {
  names: ['hostid'],
  infer(ctx) {
    printer(ctx, 'hostid reports on the host', 'hostid writes the numeric host identifier in hexadecimal.');
  },
};
