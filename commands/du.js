import { unused, scanOptions, fileInput, namesFrom } from './helpers.js';

export default {
  names: ['du'],
  infer({ name, args, set, output, errors }) {
    output('du writes the disk usage of each path to stdout.'); errors();
    const scan = scanOptions(args, { flags: '0abcDHhkLlmPSsx', values: 'BdtX', longFlags: ['--null', '--all', '--apparent-size', '--bytes', '--total', '--dereference-args', '--human-readable', '--inodes', '--dereference', '--count-links', '--no-dereference', '--separate-dirs', '--si', '--summarize', '--time', '--one-file-system'],
      longValues: ['--block-size', '--max-depth', '--files0-from', '--threshold', '--time', '--time-style', '--exclude-from', '--exclude'] });
    if (scan.help) set(0, fileInput(name, scan));
    else if (scan.valid && scan.options.has('--files0-from')) set(0, namesFrom(name, scan.options.get('--files0-from')));
    else if (scan.valid) set(0, unused(0, 'du measures the paths in its arguments, or the working directory; it does not read stdin.'));
  },
};
