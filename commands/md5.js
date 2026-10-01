import { unused, possible, scanOptions, fileInput, bsd } from './helpers.js';

// https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/md5/md5.c
const spec = bsd('bc:pqrs:tx', [
  '--binary', '--check', '--ignore-missing', '--quiet', '--status', '--strict',
  '--tag', '--text', '--warn', '--zero',
]);

export default {
  names: ['md5'],
  linux: false,
  instead: { linux: { md5: 'use md5sum' } },
  infer({ name, args, set, output, errors }) {
    output('md5 writes a digest for each input, as MD5 (file) = …, or the bare digest with -q.'); errors();
    const scan = scanOptions(args, spec);
    const has = (...keys) => keys.some(key => scan.options.has(key));
    if (scan.help) set(0, unused(0, 'md5 prints help without reading stdin.'));
    else if (!scan.valid) return;
    // -s, -t and -x digest a string or run tests, and ignore file operands.
    else if (has('-s')) set(0, unused(0, 'md5 -s digests the string in its arguments; it does not read stdin.'));
    else if (has('-t', '-x')) set(0, unused(0, 'md5 -t and -x run built-in tests; they do not read stdin.'));
    else if (has('-p')) {
      set(0, possible(0, 'md5 -p reads stdin and ignores file operands.'));
      output('md5 -p copies stdin to stdout, then writes its digest.');
    } else set(0, fileInput(name, scan));
  },
};
