import { fileAction, bsd } from './helpers.js';

// macOS ships the BSD install: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/install/xinstall.c
const macos = bsd('B:bCcD:df:g:h:l:M:m:N:o:pSsT:Uv');

export default {
  names: ['install'],
  infer(ctx) {
    fileAction(ctx, ctx.platform === 'macos' ? macos : { flags: 'bcCdDpsTvZ', values: 'gmoSt', longFlags: ['--backup', '--compare', '--directory', '--preserve-timestamps', '--strip', '--no-target-directory', '--verbose', '--preserve-context', '--context'],
      longValues: ['--backup', '--group', '--mode', '--owner', '--strip-program', '--suffix', '--target-directory', '--context'] }, { verbose: ['-v', '--verbose'], reports: 'reports each file and directory it creates' });
  },
};
