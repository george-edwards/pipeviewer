import { filterInput } from './helpers.js';

export default {
  names: ['tsort'],
  infer(ctx) {
    filterInput(ctx, {}, { maxFiles: 1, writes: 'tsort writes the items in an order consistent with the pairs it reads.' });
  },
};
