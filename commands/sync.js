import { fileAction } from './helpers.js';

export default {
  names: ['sync'],
  infer(ctx) {
    fileAction(ctx, { flags: 'df', longFlags: ['--data', '--file-system'] });
  },
};
