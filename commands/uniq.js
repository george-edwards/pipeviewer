import { unused, stdoutPath, scanOptions, fileInput, bsd } from './helpers.js';

// macOS ships the BSD uniq: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/uniq/uniq.c
const macos = bsd('+D::cdif:s:u', [
  '--all-repeated', '--all-repeated=', '--count', '--repeated', '--skip-fields=', '--ignore-case',
  '--skip-chars=', '--unique',
]);

export default {
  names: ['uniq'],
  infer({ name, args, set, output, errors, platform }) {
    output('uniq may write the remaining or counted lines to stdout.'); errors();
    // --all-repeated and --group take an optional value, so they appear as flags and as values.
    const scan = scanOptions(args, platform === 'macos' ? macos : { flags: 'cdDiuz', values: 'fsw',
      longFlags: ['--count', '--repeated', '--all-repeated', '--group', '--ignore-case', '--unique', '--zero-terminated'],
      longValues: ['--skip-fields', '--skip-chars', '--check-chars', '--all-repeated', '--group'] });
    // uniq takes at most an input file and an output file.
    const [input, outputFile] = scan.files;
    if (scan.help) set(0, fileInput(name, scan));
    else if (scan.valid && scan.files.length <= 2) {
      set(0, fileInput(name, { ...scan, files: input ? [input] : [] }));
      if (outputFile && !outputFile.dynamic && (platform === 'macos' || outputFile.value !== '-') && !stdoutPath(outputFile.value)) set(1, unused(1, 'uniq writes to the named output file instead of stdout.'));
    }
  },
};
