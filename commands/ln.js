import { possible, fileAction } from './helpers.js';

export default {
  names: ['ln'],
  infer(ctx) {
    const scan = fileAction(ctx, { flags: 'bdFfiLnPrsTv', values: 'St', longFlags: ['--backup', '--directory', '--force', '--interactive', '--logical', '--no-dereference', '--physical', '--relative', '--symbolic', '--no-target-directory', '--verbose'],
      longValues: ['--backup', '--suffix', '--target-directory'] }, { verbose: ['-v', '--verbose'], reports: 'reports each link it makes' });
    if (scan.valid && ['-i', '--interactive'].some(key => scan.options.has(key))) ctx.set(0, possible(0, 'ln -i asks before replacing a file and reads the answer from stdin.'));
  },
};
