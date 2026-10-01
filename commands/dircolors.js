import { unused, scanOptions, fileInput } from './helpers.js';

export default {
  names: ['dircolors'],
  macos: false,
  instead: { macos: { '*': 'set LSCOLORS and use ls -G' } },
  infer({ name, args, set, output, errors }) {
    output('dircolors writes shell commands that set LS_COLORS, or with -p, its colour database.'); errors();
    const scan = scanOptions(args, { flags: 'bcp', longFlags: ['--sh', '--bourne-shell', '--csh', '--c-shell', '--print-database'] });
    if (scan.help) set(0, fileInput(name, scan));
    else if (scan.valid && scan.files.length === 0) set(0, unused(0, 'dircolors uses its built-in database when no file is named; it does not read stdin.'));
    else if (scan.valid && scan.files.length === 1) set(0, fileInput(name, scan));
  },
};
