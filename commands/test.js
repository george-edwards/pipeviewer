import { unused } from './helpers.js';

export default {
  names: ['test', '['],
  // Also a shell builtin, with the same streams.
  infer({ name, args, set, output, errors }) {
    set(0, unused(0, `${name} evaluates the expression in its arguments; it does not read stdin.`));
    set(1, unused(1, `${name} reports through its exit status and writes nothing to stdout.`));
    errors();
    if (name === '[' && args.length === 1 && ['--help', '--version'].includes(args[0].value)) output('[ prints help or version information to stdout.');
  },
};
