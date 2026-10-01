import { unused, stdoutPath, scanOptions, fileInput } from './helpers.js';

export default {
  names: ['uniq'],
  infer({ name, args, set, output, errors }) {
    output('uniq may write the remaining or counted lines to stdout.'); errors();
    // --all-repeated and --group take an optional value, so they appear as flags and as values.
    const scan = scanOptions(args, { flags: 'cdDiuz', values: 'fsw',
      longFlags: ['--count', '--repeated', '--all-repeated', '--group', '--ignore-case', '--unique', '--zero-terminated'],
      longValues: ['--skip-fields', '--skip-chars', '--check-chars', '--all-repeated', '--group'] });
    // uniq takes at most an input file and an output file.
    const [input, outputFile] = scan.files;
    if (scan.help) set(0, fileInput(name, scan));
    else if (scan.valid && scan.files.length <= 2) {
      set(0, fileInput(name, { ...scan, files: input ? [input] : [] }));
      if (outputFile && !outputFile.dynamic && outputFile.value !== '-' && !stdoutPath(outputFile.value)) set(1, unused(1, 'uniq writes to the named output file instead of stdout.'));
    }
  },
};
