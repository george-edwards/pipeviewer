import { unused, possible, unknownInput, descriptorPath, scanOptions, fileInput } from './helpers.js';

export default {
  names: ['csplit'],
  infer({ name, args, set, output, errors }) {
    errors();
    const scan = scanOptions(args, { flags: 'ksz', values: 'bfn', longFlags: ['--keep-files', '--suppress-matched', '--quiet', '--silent', '--elide-empty-files'],
      longValues: ['--suffix-format', '--prefix', '--digits'] });
    if (scan.help) { set(0, fileInput(name, scan)); output(); return; }
    if (!scan.valid || scan.files.length < 2) return;
    // csplit FILE PATTERN…: only the first operand is input.
    const [input] = scan.files;
    if (input.value === '-') set(0, possible(0, 'csplit reads stdin when the file is “-”.'));
    else if (descriptorPath(input)) set(0, unknownInput(name));
    else set(0, unused(0, 'csplit reads the named file, not stdin.'));
    if (['-s', '--quiet', '--silent'].some(key => scan.options.has(key))) set(1, unused(1, 'csplit -s writes the pieces to files and prints no sizes.'));
    else output('csplit writes the pieces to files and prints the size of each to stdout.');
  },
};
