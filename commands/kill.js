import { unused } from './helpers.js';

export default {
  names: ['kill'],
  // Usually the shell builtin, which uses the same streams as procps kill.
  infer({ args, literalArgs, set, output, errors }) {
    set(0, unused(0, 'kill sends signals to the processes in its arguments; it does not read stdin.')); errors();
    if (args.some(arg => /^(?:-l|-L|--list|--table|--help|--version)(?:=|$)/.test(arg.value))) output('kill -l lists signal names on stdout.');
    else if (literalArgs) set(1, unused(1, 'kill writes nothing to stdout when sending signals.'));
  },
};
