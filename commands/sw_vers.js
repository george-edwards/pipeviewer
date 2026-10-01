import { printer } from './helpers.js';

export default {
  names: ['sw_vers'],
  linux: false,
  instead: { linux: { '*': 'read /etc/os-release, or use lsb_release -a' } },
  infer(ctx) {
    printer(ctx, 'sw_vers reports the macOS version', 'sw_vers writes the product name, version and build to stdout.');
  },
};
