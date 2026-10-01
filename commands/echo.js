import { unused } from './helpers.js';

export default {
  names: ['echo', 'printf'],
  infer({ name, args, literalArgs, set, output, errors }) {
    set(0, unused(0, `${name} ignores stdin and formats its arguments; it does not wait for input from a pipe.`));
    output(`${name} may write its formatted arguments to stdout. The exact bytes and success of writes are not predicted.`);
    if (name === 'echo' && literalArgs && args[0]?.value === '-n' && (args.length === 1 || (args.length === 2 && args[1].value === ''))) {
      set(1, unused(1, 'echo -n with no text suppresses the newline and writes no stdout data.'));
    }
    errors();
  },
};
