import { unused, filterInput, bsd } from './helpers.js';

// macOS ships the BSD gzip as zcat and gzcat: https://github.com/apple-oss-distributions/file_cmds/blob/file_cmds-457.140.3/gzip/gzip.c
const macos = bsd('123456789acdfhklLNnqrS:tVv', [
  '--stdout', '--to-stdout', '--decompress', '--uncompress', '--force', '--keep',
  '--list', '--no-name', '--name', '--quiet', '--recursive', '--suffix=',
  '--test', '--verbose', '--fast', '--best', '--ascii', '--license',
]);

export default {
  names: ['zcat', 'gzcat'],
  linux: ['zcat'],
  infer(ctx) {
    const { args, set } = ctx;
    const scan = filterInput(ctx, ctx.platform === 'macos' ? macos : { flags: 'cdfklLnNqtv123456789', values: 'S', longFlags: ['--stdout', '--to-stdout', '--decompress', '--uncompress', '--force', '--keep', '--list', '--license',
      '--no-name', '--name', '--quiet', '--test', '--verbose', '--synchronous', '--rsyncable', '--fast', '--best'], longValues: ['--suffix'] });
    if (args.length === 1 && ['-h', '-V', '-L'].includes(args[0].value)) {
      set(0, unused(0, 'zcat prints help, version or licence information without reading stdin.'));
    } else if (scan.valid && ['-t', '--test'].some(key => scan.options.has(key)) && !['-l', '--list'].some(key => scan.options.has(key))) {
      set(1, unused(1, 'zcat -t checks the compressed data and reports problems on stderr; it writes nothing to stdout.'));
    }
    // In its default UNIX 2003 mode, Apple's zcat adds .Z to a file name unless -f is given.
    if (ctx.platform === 'macos' && ctx.name === 'zcat' && scan.valid && scan.files.some(file => !/\.Z$/.test(file.value) && file.value !== '-') && !scan.options.has('-f')) {
      ctx.note('macOS zcat looks for FILE.Z, so zcat file.gz fails. Use gzcat for .gz files.');
    }
  },
};
