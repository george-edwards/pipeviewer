import { fileAction } from './helpers.js';

export default {
  names: ['unlink'],
  infer(ctx) {
    fileAction(ctx, {});
  },
};
