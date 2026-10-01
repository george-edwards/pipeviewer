import { unused, filterInput, bsd } from './helpers.js';

// macOS 15's md5 in GNU mode: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/md5/md5.c
const macos = bsd('bctwz', ['--algorithm=', '--binary', '--check', '--ignore-missing', '--quiet', '--status', '--strict', '--tag', '--text', '--UNIVERSAL', '--warn', '--zero']);

export default {
  names: ['md5sum', 'sha1sum', 'sha224sum', 'sha256sum', 'sha384sum', 'sha512sum', 'b2sum'],
  // On macOS 15 and later the *sum names are links to md5 in a GNU-compatible mode; macOS 14 has none.
  macos: ['md5sum', 'sha1sum', 'sha224sum', 'sha256sum', 'sha384sum', 'sha512sum'],
  instead: { macos: { b2sum: 'install GNU coreutils with Homebrew for b2sum' } },
  // One program built with different digests. With --check, the inputs are lists of checksums to verify.
  infer(ctx) {
    const { name } = ctx;
    const spec = ctx.platform === 'macos' ? { ...macos } : { flags: 'bctzw', longFlags: ['--binary', '--check', '--tag', '--text', '--zero', '--ignore-missing', '--quiet', '--status', '--strict', '--warn'] };
    if (name === 'b2sum') Object.assign(spec, { values: 'l', longValues: ['--length'] });
    const scan = filterInput(ctx, spec, { writes: `${name} writes a checksum for each input, or with --check, a result for each file listed.` });
    if (scan.valid && ['-c', '--check'].some(key => scan.options.has(key)) && scan.options.has('--status')) ctx.set(1, unused(1, `${name} --check --status reports only through its exit status.`));
  },
};
