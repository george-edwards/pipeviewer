import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD cat: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/cat/cat.c
const macos = bsd('belnstuv');

export default {
  names: ['cat'],
  infer(ctx) {
    filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'AbenstuvET', longFlags: ['--show-all', '--number-nonblank', '--show-ends', '--number', '--squeeze-blank', '--show-tabs', '--show-nonprinting'] });
  },
};
