import { fileAction } from './helpers.js';

export default {
  names: ['link'],
  infer(ctx) {
    fileAction(ctx, {});
  },
};
