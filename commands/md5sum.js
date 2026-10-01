import { unused, filterInput } from './helpers.js';

export default {
  names: ['md5sum', 'sha1sum', 'sha224sum', 'sha256sum', 'sha384sum', 'sha512sum', 'b2sum'],
  // One program built with different digests. With --check, the inputs are lists of checksums to verify.
  infer(ctx) {
    const { name } = ctx;
    const spec = { flags: 'bctzw', longFlags: ['--binary', '--check', '--tag', '--text', '--zero', '--ignore-missing', '--quiet', '--status', '--strict', '--warn'] };
    if (name === 'b2sum') Object.assign(spec, { values: 'l', longValues: ['--length'] });
    const scan = filterInput(ctx, spec, { writes: `${name} writes a checksum for each input, or with --check, a result for each file listed.` });
    if (scan.valid && ['-c', '--check'].some(key => scan.options.has(key)) && scan.options.has('--status')) ctx.set(1, unused(1, `${name} --check --status reports only through its exit status.`));
  },
};
