import { usage, unused, scanOptions, fileInput, bsd } from './helpers.js';

// macOS ships the BSD split: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/split/split.c
const macos = bsd('0::1::2::3::4::5::6::7::8::9::a:b:cdl:n:p:');

export default {
  names: ['split'],
  infer({ name, args, set, output, errors, platform }) {
    errors();
    const scan = scanOptions(args, platform === 'macos' ? macos : { flags: 'dxeu', values: 'abClnt', longFlags: ['--numeric-suffixes', '--hex-suffixes', '--elide-empty-files', '--unbuffered', '--verbose'],
      longValues: ['--suffix-length', '--additional-suffix', '--bytes', '--line-bytes', '--numeric-suffixes', '--hex-suffixes', '--filter', '--lines', '--number', '--separator'] });
    if (scan.help) { set(0, fileInput(name, scan)); output(); return; }
    // split [FILE [PREFIX]]: the second operand names the output files.
    if (!scan.valid || scan.files.length > 2) return;
    set(0, fileInput(name, { ...scan, files: scan.files.slice(0, 1) }));
    if (scan.options.has('--filter')) set(1, usage('unknown', 'usage unknown', 'split --filter pipes each piece to a shell command, which inherits stdout.'));
    else if (scan.options.has('--verbose')) output('split --verbose reports each file it creates on stdout.');
    else set(1, unused(1, 'split writes the pieces to files; it writes nothing to stdout.'));
  },
};
