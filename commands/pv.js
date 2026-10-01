import { usage, unused, possible, stdoutPath, scanOptions, fileInput } from './helpers.js';

export default {
  names: ['pv'],
  macos: false,
  instead: { macos: { '*': 'use dd status=progress, or press Ctrl-T for progress from dd and cp' } },
  infer({ name, args, set, output, errors }) {
    errors();
    output('pv copies its input to stdout unchanged.');
    set(2, usage('possible', 'progress + errors', 'pv draws its progress display on stderr when stderr is a terminal, or always with -f or -n, and may write diagnostics.'));
    // A strict scan: an unlisted option could take a value that would otherwise look like a file.
    const scan = scanOptions(args, { flags: 'ptIeTrab8nqcWlf0CESYKXhV', values: 'AFDsimwHNLBZdRPoUx',
      longFlags: ['--progress', '--timer', '--eta', '--fineta', '--rate', '--average-rate', '--bytes', '--bits', '--buffer-percent', '--numeric', '--quiet',
        '--cursor', '--wait', '--line-mode', '--null', '--force', '--no-splice', '--skip-errors', '--stop-at-size', '--sync', '--direct-io', '--discard'],
      longValues: ['--last-written', '--format', '--delay-start', '--size', '--interval', '--average-rate-window', '--width', '--height', '--name', '--rate-limit',
        '--buffer-size', '--error-skip-block', '--watchfd', '--remote', '--pidfile', '--output', '--store-and-forward', '--extra-display'] });
    const has = (...keys) => keys.some(key => scan.options.has(key));
    const outputFile = scan.options.get('-o') ?? scan.options.get('--output');
    if (scan.help || (scan.valid && args.length === 1 && has('-h', '-V'))) set(0, unused(0, 'pv prints help or version information without reading stdin.'));
    else if (scan.valid && has('-d', '--watchfd')) {
      set(0, unused(0, 'pv -d watches another process’s file descriptors; it does not read stdin.'));
      set(1, unused(1, 'pv -d only reports on another process; it copies no data to stdout.'));
    } else if (scan.valid && has('-R', '--remote')) {
      set(0, unused(0, 'pv -R changes the settings of another running pv; it does not read stdin.'));
      set(1, unused(1, 'pv -R sends new settings to another pv and copies no data.'));
      set(2, possible(2, 'pv -R shows no progress itself; errors go to stderr.'));
    } else {
      set(0, fileInput(name, scan));
      if (scan.valid && has('-X', '--discard')) set(1, unused(1, 'pv -X reads and measures its input, then discards it instead of writing stdout.'));
      else if (scan.valid && outputFile !== undefined && outputFile !== '-' && !stdoutPath(outputFile)) set(1, unused(1, 'pv -o writes the data to the named file instead of stdout.'));
      if (scan.valid && has('-q', '--quiet')) set(2, possible(2, 'pv -q shows no progress display; only diagnostics go to stderr.'));
    }
  },
};
