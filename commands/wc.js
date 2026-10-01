import { namesFrom, filterInput } from './helpers.js';

export default {
  names: ['wc'],
  infer(ctx) {
    const scan = filterInput(ctx, { flags: 'clmwL', longFlags: ['--bytes', '--chars', '--lines', '--words', '--max-line-length'], longValues: ['--files0-from', '--total'] });
    if (scan.valid && scan.options.has('--files0-from')) ctx.set(0, namesFrom(ctx.name, scan.options.get('--files0-from')));
  },
};
