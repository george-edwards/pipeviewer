import { filterInput } from './helpers.js';

export default {
  names: ['sum'],
  infer(ctx) {
    filterInput(ctx, { flags: 'rs', longFlags: ['--sysv'] }, { writes: 'sum writes a checksum and block count for each input.' });
  },
};
