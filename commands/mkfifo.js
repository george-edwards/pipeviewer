import { fileAction } from './helpers.js';

export default {
  names: ['mkfifo'],
  infer(ctx) {
    fileAction(ctx, { flags: 'Z', values: 'm', longFlags: ['--context'], longValues: ['--mode', '--context'] });
  },
};
