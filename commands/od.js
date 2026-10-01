import { unknownInput, filterInput, bsd } from './helpers.js';

// macOS ships the BSD od: https://github.com/apple-oss-distributions/shell_cmds/blob/shell_cmds-326/hexdump/odsyntax.c
const macos = bsd('A:aBbcDdeFfHhIij:LlN:Oost:vXx');

export default {
  names: ['od'],
  infer(ctx) {
    const scan = filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'vwabcdfilosx', values: 'AjNSt', longFlags: ['--strings', '--output-duplicates', '--width', '--traditional'],
      longValues: ['--address-radix', '--endian', '--skip-bytes', '--read-bytes', '--strings', '--format', '--width'] }, { dashMeansStdin: ctx.platform !== 'macos', writes: 'od writes a dump of its input bytes, in octal by default.' });
    // An operand such as +16 is an offset into stdin, not a file.
    if (scan.valid && scan.files.some(file => /^\+/.test(file.value))) ctx.set(0, unknownInput(ctx.name));
  },
};
