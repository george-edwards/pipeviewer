import { filterInput } from './helpers.js';

export default {
  names: ['fmt'],
  infer(ctx) {
    // Obsolete width forms such as -72 are accepted as digit flags.
    filterInput(ctx, { flags: 'cstu0123456789', values: 'pwg', longFlags: ['--crown-margin', '--split-only', '--tagged-paragraph', '--uniform-spacing'],
      longValues: ['--prefix', '--width', '--goal'] }, { writes: 'fmt writes its input refilled into paragraphs of even width.' });
  },
};
