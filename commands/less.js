import { unknownInput, fileInput } from './helpers.js';

export default {
  // more is less on macOS. Both page to the terminal and read keys from /dev/tty, not stdin.
  names: ['less', 'more'],
  infer({ name, args, literalArgs, set, output, errors }) {
    output(`${name} pages its input to the terminal; when stdout is not a terminal it copies the input there.`); errors();
    // Options are many and some take values, so any option leaves stdin unknown.
    if (!literalArgs || args.some(arg => /^[-+]/.test(arg.value))) { set(0, unknownInput(name)); return; }
    set(0, fileInput(name, { valid: true, files: args, options: new Map() }));
  },
};
