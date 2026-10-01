import { unused } from './helpers.js';

export default {
  // dir and vdir are ls with different default formats.
  names: ['ls', 'dir', 'vdir'],
  infer({ name, set, output, errors }) {
    set(0, unused(0, `${name} lists paths from arguments or the current directory; it does not read stdin.`));
    output(`${name} may write directory entries or help text to stdout.`); errors();
  },
};
