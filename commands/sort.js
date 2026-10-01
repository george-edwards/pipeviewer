import { unused, stdoutPath, scanOptions, fileInput, namesFrom } from './helpers.js';

export default {
  names: ['sort'],
  infer({ name, args, set, output, errors }) {
    output('sort may write sorted lines to stdout once it has read all of its input.'); errors();
    const scan = scanOptions(args, { flags: 'bdfgiMhnRrsuVzcCm', values: 'kotST',
      longFlags: ['--ignore-leading-blanks', '--dictionary-order', '--ignore-case', '--general-numeric-sort', '--ignore-nonprinting', '--month-sort',
        '--human-numeric-sort', '--numeric-sort', '--random-sort', '--reverse', '--version-sort', '--check', '--debug', '--merge', '--stable', '--unique', '--zero-terminated'],
      longValues: ['--key', '--output', '--field-separator', '--buffer-size', '--temporary-directory', '--parallel', '--batch-size', '--compress-program',
        '--random-source', '--sort', '--files0-from', '--check'] });
    if (scan.valid && scan.options.has('--files0-from')) set(0, namesFrom(name, scan.options.get('--files0-from')));
    else set(0, fileInput(name, scan));
    if (scan.valid && !scan.help) {
      const outputFile = scan.options.get('-o') ?? scan.options.get('--output');
      if (['-c', '-C', '--check'].some(key => scan.options.has(key))) set(1, unused(1, 'sort in check mode reports disorder through stderr and its exit status; it writes nothing to stdout.'));
      else if (outputFile !== undefined && !stdoutPath(outputFile)) set(1, unused(1, 'sort -o writes the sorted result to the named file instead of stdout.'));
    }
  },
};
