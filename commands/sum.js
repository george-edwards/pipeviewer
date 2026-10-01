import { fileInput, filterInput } from './helpers.js';

export default {
  names: ['sum'],
  infer(ctx) {
    // BSD sum takes no options: every argument, even -r, is a file, and “-” is a file too.
    if (ctx.platform === 'macos') {
      ctx.output('sum writes a checksum and block count for each input.'); ctx.errors();
      ctx.set(0, fileInput(ctx.name, { valid: true, files: ctx.args, options: new Map() }, { dashMeansStdin: false }));
      return;
    }
    filterInput(ctx, { flags: 'rs', longFlags: ['--sysv'] }, { writes: 'sum writes a checksum and block count for each input.' });
  },
};
