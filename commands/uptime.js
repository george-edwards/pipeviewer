import { printer } from './helpers.js';

export default {
  names: ['uptime'],
  infer(ctx) {
    printer(ctx, 'uptime reports on the system', 'uptime writes the time, uptime, user count and load averages.');
  },
};
