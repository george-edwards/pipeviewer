import { filterInput, bsd } from './helpers.js';

// macOS ships the BSD fold: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/fold/fold.c
const macos = bsd('0123456789bsw:');

export default {
  names: ['fold'],
  infer(ctx) {
    filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'bs', values: 'w', longFlags: ['--bytes', '--spaces'], longValues: ['--width'] }, { dashMeansStdin: ctx.platform !== 'macos', writes: 'fold writes its input with long lines wrapped.' });
  },
};
