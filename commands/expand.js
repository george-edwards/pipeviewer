import { filterInput } from './helpers.js';

export default {
  names: ['expand'],
  infer(ctx) {
    // Obsolete width forms such as -72 are accepted as digit flags.
    filterInput(ctx, { flags: 'i0123456789', values: 't', longFlags: ['--initial'], longValues: ['--tabs'] }, { writes: 'expand writes its input with tabs converted to spaces.' });
  },
};
