import { fileAction } from './helpers.js';

export default {
  names: ['sync'],
  infer(ctx) {
    // BSD sync ignores its arguments.
    if (ctx.platform === 'macos') { fileAction({ ...ctx, args: [] }, {}); return; }
    fileAction(ctx, { flags: 'df', longFlags: ['--data', '--file-system'] });
  },
};
