import { filterInput } from './helpers.js';

const shared = ['--decode', '--ignore-garbage'];
const encodings = ['--base64', '--base64url', '--base32', '--base32hex', '--base16', '--base2msbf', '--base2lsbf', '--z85'];

export default {
  names: ['base64', 'basenc'],
  // Each takes at most one input file.
  infer(ctx) {
    filterInput(ctx, { flags: 'di', values: 'w', longFlags: ctx.name === 'basenc' ? [...shared, ...encodings] : shared, longValues: ['--wrap'] }, { maxFiles: 1 });
  },
};
