import { fileAction } from './helpers.js';

export default {
  names: ['mknod'],
  infer(ctx) {
    fileAction(ctx, { flags: 'Z', values: 'm', longFlags: ['--context'], longValues: ['--mode', '--context'] });
  },
};
