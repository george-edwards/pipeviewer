import { unused, stdoutPath, scanOptions, fileInput, namesFrom, bsd } from './helpers.js';

// macOS ships the BSD sort: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/sort/sort.c
const macos = bsd('bcCdfghik:Mmno:RrsS:t:T:uVz', [
  '--batch-size=', '--buffer-size=', '--check', '--check=', '--compress-program=', '--debug',
  '--dictionary-order', '--field-separator=', '--files0-from=', '--general-numeric-sort', '--heapsort', '--human-numeric-sort',
  '--ignore-leading-blanks', '--ignore-case', '--ignore-nonprinting', '--key=', '--merge', '--mergesort',
  '--mmap', '--month-sort', '--numeric-sort', '--output=', '--parallel=', '--qsort',
  '--radixsort', '--random-sort', '--random-source=', '--reverse', '--sort=', '--stable',
  '--temporary-directory=', '--unique', '--version-sort', '--zero-terminated',
]);

export default {
  names: ['sort'],
  infer({ name, args, set, output, errors, platform }) {
    output('sort may write sorted lines to stdout once it has read all of its input.'); errors();
    const scan = scanOptions(args, platform === 'macos' ? macos : { flags: 'bdfgiMhnRrsuVzcCm', values: 'kotST',
      longFlags: ['--ignore-leading-blanks', '--dictionary-order', '--ignore-case', '--general-numeric-sort', '--ignore-nonprinting', '--month-sort',
        '--human-numeric-sort', '--numeric-sort', '--random-sort', '--reverse', '--version-sort', '--check', '--debug', '--merge', '--stable', '--unique', '--zero-terminated'],
      longValues: ['--key', '--output', '--field-separator', '--buffer-size', '--temporary-directory', '--parallel', '--batch-size', '--compress-program',
        '--random-source', '--sort', '--files0-from', '--check'] });
    const namesFile = scan.options.get('--files0-from');
    if (scan.valid && namesFile !== undefined && platform === 'macos' && namesFile === '-') set(0, unused(0, 'BSD sort opens --files0-from=- as a file named “-”, not stdin.'));
    else if (scan.valid && namesFile !== undefined) set(0, namesFrom(name, namesFile));
    else set(0, fileInput(name, scan));
    if (scan.valid && !scan.help) {
      const outputFile = scan.options.get('-o') ?? scan.options.get('--output');
      if (['-c', '-C', '--check'].some(key => scan.options.has(key))) set(1, unused(1, 'sort in check mode reports disorder through stderr and its exit status; it writes nothing to stdout.'));
      else if (outputFile !== undefined && !stdoutPath(outputFile)) set(1, unused(1, 'sort -o writes the sorted result to the named file instead of stdout.'));
    }
  },
};
