import { unused } from './helpers.js';

export default {
  names: ['pathchk'],
  infer({ args, set, output, errors }) {
    set(0, unused(0, 'pathchk checks the names in its arguments; it does not read stdin.'));
    if (args.length === 1 && ['--help', '--version'].includes(args[0].value)) output('pathchk prints help or version information to stdout.');
    else set(1, unused(1, 'pathchk reports problems on stderr and writes nothing to stdout.'));
    errors();
  },
};
