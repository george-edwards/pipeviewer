import { fileAction } from './helpers.js';

export default {
  names: ['touch'],
  infer(ctx) {
    fileAction(ctx, { flags: 'acfhm', values: 'drt', longFlags: ['--no-create', '--no-dereference'], longValues: ['--date', '--reference', '--time'] });
  },
};
