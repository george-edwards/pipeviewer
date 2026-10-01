import { unused } from './helpers.js';

export default {
  names: ['sleep'],
  infer({ args, literalArgs, set, output, errors }) {
    set(0, unused(0, 'sleep ignores stdin; its delay does not depend on incoming data.'));
    const durations = args[0]?.value === '--' ? args.slice(1) : args;
    const isDelay = literalArgs && durations.length > 0 && durations.every(arg => /^(?:\d+(?:\.\d*)?|\.\d+)(?:[smhd])?$/.test(arg.value));
    if (isDelay) set(1, unused(1, 'sleep does not write to stdout when delaying. This predicts no stdout bytes; it is not a measured count.'));
    else output('sleep may write to stdout for options such as --help or --version; these arguments are not modelled as a delay.');
    errors();
  },
};
