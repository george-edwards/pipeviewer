import { unused, scanOptions, fileInput } from './helpers.js';

// Perl's Digest::SHA script, on macOS and on Linux systems with Perl.
const spec = { flags: '0bchqstUvw', values: 'a', longFlags: ['--binary', '--check', '--text', '--UNIVERSAL', '--0', '--tag', '--quiet', '--status', '--strict', '--warn', '--ignore-missing'], longValues: ['--algorithm'] };

export default {
  names: ['shasum'],
  infer({ name, args, set, output, errors }) {
    output('shasum writes a digest for each input, or with -c, a result for each file listed.'); errors();
    const scan = scanOptions(args, spec);
    if (scan.help) { set(0, unused(0, 'shasum prints help without reading stdin.')); return; }
    if (!scan.valid) return;
    set(0, fileInput(name, scan));
    const check = ['-c', '--check'].some(key => scan.options.has(key));
    if (check && ['-s', '--status'].some(key => scan.options.has(key))) set(1, unused(1, 'shasum -c --status reports only through its exit status.'));
  },
};
