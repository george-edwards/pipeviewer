import { fileAction } from './helpers.js';

export default {
  names: ['truncate'],
  infer(ctx) {
    fileAction(ctx, { flags: 'co', values: 'rs', longFlags: ['--no-create', '--io-blocks'], longValues: ['--reference', '--size'] });
  },
};
