import { usage, unused } from './helpers.js';

export default {
  names: ['true', 'false'],
  infer({ name, args, literalArgs, set, errors }) {
    set(0, unused(0, `${name} returns an exit status without reading stdin.`));
    if (!literalArgs || args.some(arg => arg.value === '--help' || arg.value === '--version')) {
      set(1, usage('unknown', 'usage unknown', `A shell builtin ${name} is silent, but an external ${name} may print help or version information.`));
      errors();
    } else {
      for (const fd of [1, 2]) set(fd, unused(fd, `${name} returns an exit status without writing standard streams.`));
    }
  },
};
