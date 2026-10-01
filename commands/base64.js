import { unused, possible, unknownInput, descriptorPath, stdoutPath, scanOptions, filterInput, bsd } from './helpers.js';

const shared = ['--decode', '--ignore-garbage'];
const encodings = ['--base64', '--base64url', '--base32', '--base32hex', '--base16', '--base2msbf', '--base2lsbf', '--z85'];

// macOS ships the BSD base64 (bintrans): https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/bintrans/bintrans.c
const macos = bsd('b:Ddhi:o:w:', ['--decode', '--break=', '--breaks=', '--input=', '--output=', '--wrap=']);

export default {
  names: ['base64', 'base32', 'basenc'],
  macos: ['base64'],
  instead: { macos: { '*': 'use base64, or install GNU coreutils with Homebrew' } },
  // Each takes at most one input file.
  infer(ctx) {
    if (ctx.platform === 'macos') { bsdBase64(ctx); return; }
    filterInput(ctx, { flags: 'di', values: 'w', longFlags: ctx.name === 'basenc' ? [...shared, ...encodings] : shared, longValues: ['--wrap'] }, { maxFiles: 1 });
  },
};

// BSD base64 has no file operands: it reads -i FILE (stdin by default) and writes -o FILE (stdout).
function bsdBase64({ name, args, set, output, errors, note }) {
  output('base64 writes the encoded or decoded data to stdout unless -o names a file.'); errors();
  const scan = scanOptions(args, macos);
  if (scan.help) { set(0, unused(0, 'base64 prints help without reading stdin.')); return; }
  if (!scan.valid) return;
  if (scan.files.length) {
    note('macOS base64 takes no file operands, so base64 FILE fails. Use base64 -i FILE, or base64 < FILE.');
    set(0, unused(0, 'macOS base64 rejects a file operand and exits without reading.'));
    set(1, unused(1, 'macOS base64 rejects a file operand and writes nothing to stdout.'));
    return;
  }
  const input = scan.options.get('-i') ?? scan.options.get('--input'), outputFile = scan.options.get('-o') ?? scan.options.get('--output');
  if (input === undefined || input === '-') set(0, possible(0, 'base64 reads stdin unless -i names a file.'));
  else if (descriptorPath(input)) set(0, unknownInput(name));
  else set(0, unused(0, 'base64 -i reads the named file instead of stdin.'));
  if (outputFile !== undefined && outputFile !== '-' && !stdoutPath(outputFile)) set(1, unused(1, 'base64 -o writes to the named file instead of stdout.'));
}
