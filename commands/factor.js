import { unused, possible } from './helpers.js';

export default {
  names: ['factor'],
  infer({ args, literalArgs, set, output, errors }) {
    output('factor writes each number followed by its prime factors.'); errors();
    const numbers = args.filter(arg => !['--', '-h', '--exponents'].includes(arg.value));
    if (args.length === 1 && ['--help', '--version'].includes(args[0].value)) set(0, unused(0, 'factor prints help or version information without reading stdin.'));
    else if (literalArgs) set(0, numbers.length ? unused(0, 'factor factors the numbers in its arguments; it does not read stdin.') : possible(0, 'factor reads numbers from stdin when none are given as arguments.'));
  },
};
