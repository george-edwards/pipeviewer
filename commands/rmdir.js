import { fileAction } from './helpers.js';

export default {
  names: ['rmdir'],
  infer(ctx) {
    fileAction(ctx, { flags: 'pv', longFlags: ['--ignore-fail-on-non-empty', '--parents', '--verbose'] }, { verbose: ['-v', '--verbose'], reports: 'reports each directory it removes' });
  },
};
