import { usage, unused, possible, scanOptions } from './helpers.js';

// GNU make; macOS's /usr/bin/make is GNU make 3.81 from the Xcode Command Line Tools.
const spec = {
  flags: 'BdehiknpqrRsStvwL', values: 'CfIoWE',
  longFlags: ['--always-make', '--debug', '--environment-overrides', '--ignore-errors', '--jobs', '--keep-going', '--load-average', '--max-load', '--check-symlink-times',
    '--just-print', '--dry-run', '--recon', '--output-sync', '--print-data-base', '--question', '--no-builtin-rules', '--no-builtin-variables', '--silent', '--quiet',
    '--no-silent', '--stop', '--no-keep-going', '--touch', '--trace', '--print-directory', '--no-print-directory', '--warn-undefined-variables'],
  longValues: ['--directory', '--debug', '--eval', '--file', '--makefile', '--include-dir', '--jobs', '--load-average', '--max-load', '--assume-old', '--old-file',
    '--output-sync', '--what-if', '--new-file', '--assume-new'],
};

export default {
  names: ['make'],
  infer({ args, set, output, errors, platform, note }) {
    errors();
    if (platform === 'macos') note('On macOS, make comes with the Xcode Command Line Tools. Until xcode-select --install has been run, /usr/bin/make only offers to install them. Apple’s make is GNU make 3.81.');
    // -j and -l take an optional number, attached or as the next word, and -O an attached type.
    const words = [];
    for (let i = 0; i < args.length; i++) {
      const value = args[i].value;
      if (/^-[jl][\d.]*$/.test(value)) { if (value.length === 2 && /^\d+(?:\.\d+)?$/.test(args[i + 1]?.value ?? '')) i++; continue; }
      if (/^-O\w*$/.test(value)) continue;
      words.push(args[i]);
    }
    const scan = scanOptions(words, spec);
    const has = (...keys) => keys.some(key => scan.options.has(key));
    if (scan.help || (args.length === 1 && args[0].value === '-v')) {
      set(0, unused(0, 'make prints help or version information without reading stdin.'));
      output('make prints help or version information to stdout.');
      return;
    }
    if (!scan.valid) return;
    const makefile = scan.options.get('-f') ?? scan.options.get('--file') ?? scan.options.get('--makefile');
    if (has('-q', '--question')) {
      set(0, unused(0, 'make -q only checks whether the targets are up to date; it runs no recipes.'));
      set(1, unused(1, 'make -q reports through its exit status and writes nothing to stdout.'));
      return;
    }
    // Recipes run with make's own descriptors, so they may read stdin and write anywhere make can.
    if (makefile === '-') set(0, possible(0, 'make -f - reads the makefile from stdin.'));
    else if (has('-n', '--just-print', '--dry-run', '--recon')) set(0, unused(0, 'make -n prints the recipes without running them, so nothing reads stdin.'));
    else set(0, usage('unknown', 'usage unknown', 'make reads its makefile, not stdin, but the recipes it runs inherit stdin and may read it.'));
    output(has('-n', '--just-print', '--dry-run', '--recon') ? 'make -n prints each recipe it would run.' : 'make prints each recipe before running it, unless -s is given, and the recipes write their output to stdout.');
    set(2, possible(2, 'make reports errors on stderr, and the recipes write their diagnostics there.'));
  },
};
