import { unused } from './helpers.js';

export default {
  names: ['stty'],
  // stty's settings, such as -echo, look like options, so the arguments are read by hand.
  infer({ args, literalArgs, set, output, errors }) {
    errors();
    const values = args.map(arg => arg.value);
    if (values.length === 1 && ['--help', '--version'].includes(values[0])) {
      set(0, unused(0, 'stty prints help or version information without reading stdin.'));
      output('stty prints help or version information to stdout.');
      return;
    }
    if (!literalArgs) return;
    const device = values.findIndex(value => /^(?:-F|--file)(?:=|$)|^-F./.test(value));
    const rest = values.filter((value, i) => i !== device && !(i === device + 1 && /^(?:-F|--file)$/.test(values[device])));
    set(0, device === -1
      ? unused(0, 'stty configures the terminal on stdin through system calls; it reads no data, and fails when stdin is not a terminal.')
      : unused(0, 'stty -F works on the named terminal, not stdin.'));
    if (rest.every(value => ['-a', '--all', '-g', '--save'].includes(value))) output('stty writes the terminal settings to stdout.');
    else set(1, unused(1, 'stty changes terminal settings and writes nothing to stdout.'));
  },
};
