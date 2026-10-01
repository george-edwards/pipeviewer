import { unused, filterInput } from './helpers.js';

export default {
  names: ['zcat'],
  infer(ctx) {
    const { args, set } = ctx;
    const scan = filterInput(ctx, { flags: 'cdfklLnNqtv123456789', values: 'S', longFlags: ['--stdout', '--to-stdout', '--decompress', '--uncompress', '--force', '--keep', '--list', '--license',
      '--no-name', '--name', '--quiet', '--test', '--verbose', '--synchronous', '--rsyncable', '--fast', '--best'], longValues: ['--suffix'] });
    if (args.length === 1 && ['-h', '-V', '-L'].includes(args[0].value)) {
      set(0, unused(0, 'zcat prints help, version or licence information without reading stdin.'));
    } else if (scan.valid && ['-t', '--test'].some(key => scan.options.has(key)) && !['-l', '--list'].some(key => scan.options.has(key))) {
      set(1, unused(1, 'zcat -t checks the compressed data and reports problems on stderr; it writes nothing to stdout.'));
    }
  },
};
