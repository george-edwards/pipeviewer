import { filterInput } from './helpers.js';

export default {
  names: ['cat'],
  infer(ctx) {
    filterInput(ctx, { flags: 'AbenstuvET', longFlags: ['--show-all', '--number-nonblank', '--show-ends', '--number', '--squeeze-blank', '--show-tabs', '--show-nonprinting'] });
  },
};
