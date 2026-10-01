import { unknownInput, filterInput } from './helpers.js';

export default {
  names: ['od'],
  infer(ctx) {
    const scan = filterInput(ctx, { flags: 'vwabcdfilosx', values: 'AjNSt', longFlags: ['--strings', '--output-duplicates', '--width', '--traditional'],
      longValues: ['--address-radix', '--endian', '--skip-bytes', '--read-bytes', '--strings', '--format', '--width'] }, { writes: 'od writes a dump of its input bytes, in octal by default.' });
    // An operand such as +16 is an offset into stdin, not a file.
    if (scan.valid && scan.files.some(file => /^\+/.test(file.value))) ctx.set(0, unknownInput(ctx.name));
  },
};
