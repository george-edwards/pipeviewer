import { scanOptions, fileInput, bsd, possible, unknownInput } from './helpers.js';

// GNU diffutils 3.8, from its --help.
const gnu = {
  flags: 'abBcdeEfhHilnNpPqrstTuvwyZ0123456789', values: 'CDFILSUWxX',
  longFlags: ['--normal', '--brief', '--report-identical-files', '--context', '--unified', '--ed', '--rcs', '--side-by-side', '--left-column', '--suppress-common-lines',
    '--show-c-function', '--new-file', '--unidirectional-new-file', '--ignore-case', '--ignore-file-name-case', '--no-ignore-file-name-case', '--ignore-tab-expansion',
    '--ignore-trailing-space', '--ignore-space-change', '--ignore-all-space', '--ignore-blank-lines', '--strip-trailing-cr', '--text', '--minimal', '--speed-large-files',
    '--suppress-blank-empty', '--expand-tabs', '--initial-tab', '--paginate', '--recursive', '--no-dereference', '--color'],
  longValues: ['--ifdef', '--show-function-line', '--ignore-matching-lines', '--label', '--starting-file', '--width', '--exclude', '--exclude-from', '--from-file', '--to-file',
    '--line-format', '--old-line-format', '--new-line-format', '--unchanged-line-format', '--old-group-format', '--new-group-format', '--unchanged-group-format',
    '--changed-group-format', '--horizon-lines', '--tabsize', '--palette'],
};
// macOS ships Apple diff, based on FreeBSD's.
const macos = bsd('0123456789abC:cdD:efF:HhI:iL:lnNPpqrS:sTtU:uwX:x:y', ['--brief', '--context', '--ed', '--forward-ed', '--speed-large-files', '--ignore-matching-lines=', '--ignore-case',
  '--paginate', '--label=', '--show-c-function', '--show-function-line=', '--unidirectional-new-file', '--new-file', '--rcs', '--recursive', '--report-identical-files',
  '--starting-file=', '--initial-tab', '--text', '--unified', '--ignore-all-space', '--exclude=', '--exclude-from=', '--ignore-blank-lines', '--ignore-space-change',
  '--strip-trailing-cr', '--side-by-side', '--width=', '--left-column', '--suppress-common-lines', '--ignore-file-name-case', '--no-ignore-file-name-case', '--normal',
  '--tabsize=', '--changed-group-format=', '--suppress-blank-empty', '--expand-tabs', '--minimal']);

export default {
  names: ['diff'],
  // diff compares two files, either of which may be “-” for stdin. GNU's --from-file and --to-file
  // compare one file with each operand instead.
  infer({ name, args, set, output, errors, platform }) {
    output('diff writes the lines that differ between the two files.'); errors();
    const scan = scanOptions(args, platform === 'macos' ? macos : gnu);
    const against = scan.options.get('--from-file') ?? scan.options.get('--to-file');
    if (against !== undefined) set(0, against === '-' ? possible(0, `${name} reads stdin for --from-file=- or --to-file=-.`) : unknownInput(name));
    else if (scan.help || (scan.valid && scan.files.length === 2)) set(0, fileInput(name, scan));
  },
};
