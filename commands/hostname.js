import { unused, unknownInput } from './helpers.js';

export default {
  names: ['hostname'],
  // From the hostname package rather than coreutils on Debian and Ubuntu.
  infer({ name, args, set, output, errors }) {
    output('hostname writes the host name, or nothing when it sets a new one.'); errors();
    if (args.some(arg => /^(?:-F|--file)/.test(arg.value))) set(0, unknownInput(name));
    else set(0, unused(0, 'hostname reports or sets the host name; it does not read stdin.'));
  },
};
