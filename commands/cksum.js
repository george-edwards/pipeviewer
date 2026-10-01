import { unused, filterInput, bsd } from './helpers.js';

// macOS ships the BSD cksum: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/cksum/cksum.c
const macos = bsd('o:');

export default {
  names: ['cksum'],
  infer(ctx) {
    // Options from coreutils 9, where cksum gained -a and --check; older cksum accepts none.
    const scan = filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'bctwz', values: 'al', longFlags: ['--base64', '--binary', '--check', '--debug', '--ignore-missing', '--quiet', '--raw', '--status', '--strict', '--tag', '--text', '--untagged', '--warn', '--zero'],
      longValues: ['--algorithm', '--length'] }, { dashMeansStdin: ctx.platform !== 'macos', writes: 'cksum writes a checksum for each input, or with --check, a result for each file listed.' });
    if (scan.valid && ['-c', '--check'].some(key => scan.options.has(key)) && scan.options.has('--status')) ctx.set(1, unused(1, 'cksum --check --status reports only through its exit status.'));
  },
};
