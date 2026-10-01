import { fileAction } from './helpers.js';

export default {
  names: ['install'],
  infer(ctx) {
    fileAction(ctx, { flags: 'bcCdDpsTvZ', values: 'gmoSt', longFlags: ['--backup', '--compare', '--directory', '--preserve-timestamps', '--strip', '--no-target-directory', '--verbose', '--preserve-context', '--context'],
      longValues: ['--backup', '--group', '--mode', '--owner', '--strip-program', '--suffix', '--target-directory', '--context'] }, { verbose: ['-v', '--verbose'], reports: 'reports each file and directory it creates' });
  },
};
