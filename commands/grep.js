import { unused, possible, unknownInput, descriptorPath, scanOptions, fileInput, bsd } from './helpers.js';

// macOS ships the BSD grep: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/grep/grep.c
const macos = bsd('0123456789A:B:C:D:EFGHIJLMOSRUVXZabcd:e:f:hilm:nopqrsuvwxyz', [
  '--binary-files=', '--mmap', '--line-buffered', '--label=', '--null', '--color',
  '--color=', '--colour', '--colour=', '--exclude=', '--include=', '--exclude-dir=',
  '--include-dir=', '--after-context=', '--text', '--before-context=', '--byte-offset', '--context',
  '--context=', '--count', '--devices=', '--directories=', '--extended-regexp', '--regexp=',
  '--fixed-strings', '--file=', '--basic-regexp', '--no-filename', '--with-filename', '--ignore-case',
  '--bz2decompress', '--files-with-matches', '--files-without-match', '--max-count=', '--lzma', '--line-number',
  '--only-matching', '--quiet', '--silent', '--recursive', '--no-messages', '--binary',
  '--unix-byte-offsets', '--invert-match', '--word-regexp', '--line-regexp', '--xz', '--null-data',
  '--decompress',
]);

export default {
  names: ['grep', 'egrep', 'fgrep'],
  infer({ name, args, set, output, errors, platform }) {
    output('grep may write matching lines, counts or file names to stdout.'); errors();
    const scan = scanOptions(args, platform === 'macos' ? macos : { flags: 'EFGPiyvwxcLloqsbHhnTZzrRaUV', values: 'efmABCdD',
      longFlags: ['--extended-regexp', '--fixed-strings', '--basic-regexp', '--perl-regexp', '--ignore-case', '--no-ignore-case', '--invert-match', '--word-regexp',
        '--line-regexp', '--count', '--color', '--colour', '--files-without-match', '--files-with-matches', '--only-matching', '--quiet', '--silent', '--no-messages',
        '--byte-offset', '--with-filename', '--no-filename', '--line-number', '--initial-tab', '--null', '--null-data', '--text', '--recursive',
        '--dereference-recursive', '--line-buffered', '--binary'],
      longValues: ['--regexp', '--file', '--max-count', '--after-context', '--before-context', '--context', '--binary-files', '--devices', '--directories',
        '--exclude', '--exclude-from', '--exclude-dir', '--include', '--label', '--color', '--colour'] });
    const option = key => scan.options.get(key);
    const patternFile = option('-f') ?? option('--file');
    const patternOption = patternFile !== undefined || option('-e') !== undefined || option('--regexp') !== undefined;
    // Without -e or -f, the first operand is the pattern rather than a file.
    const files = patternOption ? scan.files : scan.files.slice(1);
    const recursive = ['-r', '-R', '--recursive', '--dereference-recursive'].some(key => scan.options.has(key)) || [option('-d'), option('--directories')].includes('recurse');
    if (scan.help || (args.length === 1 && args[0].value === '-V')) set(0, unused(0, 'grep prints help or version information without reading stdin.'));
    else if (scan.valid && (patternOption || scan.files.length > 0)) {
      if (patternFile === '-') set(0, possible(0, 'grep reads patterns from stdin for -f -.'));
      else if (patternFile !== undefined && descriptorPath(patternFile)) set(0, unknownInput(name));
      else if (recursive && files.length === 0) set(0, unused(0, 'grep -r searches the working directory when no files are named, not stdin.'));
      else set(0, fileInput(name, { ...scan, files }));
      if (['-q', '--quiet', '--silent'].some(key => scan.options.has(key))) set(1, unused(1, 'grep -q reports a match through its exit status and writes nothing to stdout.'));
    }
  },
};
