import { unused } from './helpers.js';

export default {
  names: ['ls'],
  infer({ set, output, errors }) {
    set(0, unused(0, 'ls lists paths from arguments or the current directory; it does not read stdin.'));
    output('ls may write directory entries or help text to stdout.'); errors();
  },
};
