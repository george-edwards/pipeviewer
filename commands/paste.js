import { unused, filterInput, bsd } from './helpers.js';

// macOS ships the BSD paste: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/paste/paste.c
const macos = bsd('d:s');

export default {
  names: ['paste'],
  infer(ctx) {
    const scan = filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'sz', values: 'd', longFlags: ['--serial', '--zero-terminated'], longValues: ['--delimiters'] });
    if (ctx.platform === 'macos' && scan.valid && !scan.help && !scan.files.length) ctx.set(0, unused(0, 'BSD paste needs at least one file operand, and fails without one; give - to read stdin.'));
  },
};
