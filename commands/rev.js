import { filterInput } from './helpers.js';

export default {
  names: ['rev'],
  // rev treats “-” as a file name, not stdin.
  infer(ctx) {
    filterInput(ctx, { flags: '0', longFlags: ['--zero'] }, { dashMeansStdin: false });
  },
};
