import { unused, fileInput, filterInput } from './helpers.js';

export default {
  names: ['ptx'],
  macos: false,
  instead: { macos: { '*': 'install GNU coreutils with Homebrew' } },
  infer(ctx) {
    const scan = filterInput(ctx, { flags: 'AGRfrt', values: 'FMOSTWbgiow', longFlags: ['--auto-reference', '--traditional', '--right-side-refs', '--ignore-case', '--references', '--typeset-mode'],
      longValues: ['--flag-truncation', '--macro-name', '--format', '--sentence-regexp', '--word-regexp', '--break-file', '--gap-size', '--ignore-file', '--only-file', '--width'] }, { writes: 'ptx writes a permuted index of the words in its input.' });
    // In traditional mode, a second operand is the output file.
    if (scan.valid && ['-G', '--traditional'].some(key => scan.options.has(key)) && scan.files.length === 2) {
      ctx.set(0, fileInput(ctx.name, { ...scan, files: scan.files.slice(0, 1) }));
      ctx.set(1, unused(1, 'ptx -G writes the index to the output file named second, not stdout.'));
    }
  },
};
