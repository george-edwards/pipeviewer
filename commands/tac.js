import { filterInput } from './helpers.js';

export default {
  names: ['tac'],
  infer(ctx) {
    filterInput(ctx, { flags: 'br', values: 's', longFlags: ['--before', '--regex'], longValues: ['--separator'] }, { writes: 'tac writes the lines in reverse order once it has read each input to the end.' });
  },
};
