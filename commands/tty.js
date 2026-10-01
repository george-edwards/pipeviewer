import { unused } from './helpers.js';

export default {
  names: ['tty'],
  infer({ args, set, output, errors }) {
    set(0, unused(0, 'tty checks whether stdin is a terminal and looks up its name; it reads no data.'));
    if (args.some(arg => ['-s', '--silent', '--quiet'].includes(arg.value))) set(1, unused(1, 'tty -s reports only through its exit status.'));
    else output('tty writes the name of the terminal on stdin, or “not a tty”.');
    errors();
  },
};
