import { unused, possible, unknownInput, lenientOptions } from './helpers.js';

export default {
  names: ['say'],
  linux: false,
  instead: { linux: { '*': 'use espeak or spd-say' } },
  // say [-v voice] [-r rate] [-o file] [-f file | text …] speaks through the speakers.
  infer({ name, args, literalArgs, set, output, errors }) {
    errors();
    if (!literalArgs) return;
    const opts = lenientOptions(args, { shortValues: 'vrofanci', longValues: ['--voice', '--rate', '--output-file', '--input-file', '--audio-device', '--network-send', '--channels', '--interactive', '--file-format', '--data-format', '--bit-rate', '--quality'] });
    const file = opts.values('-f', '--input-file').at(-1);
    if (file === '-' || (file === undefined && !opts.operands.length)) set(0, possible(0, 'say speaks text from stdin when no text or file is given, or for -f -.'));
    else if (file !== undefined && /^\/dev\//.test(file)) set(0, unknownInput(name));
    else set(0, unused(0, 'say speaks the text in its arguments or file; it does not read stdin.'));
    if (opts.values('-v', '--voice').includes('?')) output('say -v ? lists the available voices on stdout.');
    else set(1, unused(1, 'say speaks through the speakers, or writes audio to the -o file; nothing goes to stdout.'));
  },
};
