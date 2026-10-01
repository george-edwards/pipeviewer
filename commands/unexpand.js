import { filterInput } from './helpers.js';

export default {
  names: ['unexpand'],
  infer(ctx) {
    // Obsolete width forms such as -72 are accepted as digit flags.
    filterInput(ctx, { flags: 'a0123456789', values: 't', longFlags: ['--all', '--first-only'], longValues: ['--tabs'] }, { writes: 'unexpand writes its input with runs of spaces converted to tabs.' });
  },
};
