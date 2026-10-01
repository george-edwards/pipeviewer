import { filterInput } from './helpers.js';

export default {
  names: ['fold'],
  infer(ctx) {
    filterInput(ctx, { flags: 'bs', values: 'w', longFlags: ['--bytes', '--spaces'], longValues: ['--width'] }, { writes: 'fold writes its input with long lines wrapped.' });
  },
};
