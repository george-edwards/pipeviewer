import { fileAction } from './helpers.js';

export default {
  names: ['mkdir'],
  infer(ctx) {
    fileAction(ctx, { flags: 'pvZ', values: 'm', longFlags: ['--parents', '--verbose', '--context'], longValues: ['--mode', '--context'] }, { verbose: ['-v', '--verbose'], reports: 'reports each directory it creates' });
  },
};
