import { printer } from './helpers.js';

export default {
  names: ['nproc'],
  macos: false,
  instead: { macos: { '*': 'use sysctl -n hw.ncpu' } },
  infer(ctx) {
    printer(ctx, 'nproc counts processors', 'nproc writes the number of available processing units.');
  },
};
