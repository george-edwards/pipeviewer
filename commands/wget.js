import { usage, unused, possible, unknownInput, descriptorPath, stdoutPath, lenientOptions } from './helpers.js';

export default {
  names: ['wget'],
  infer({ name, args, literalArgs, set, output, errors }) {
    errors();
    set(0, unknownInput(name));
    output('wget may write to stdout for -O - or for help and version information.');
    if (literalArgs) {
      const opts = lenientOptions(args, { shortValues: 'oaiBtOTwQPUelARDIXY',
        longValues: ['--output-document', '--input-file', '--output-file', '--append-output', '--user-agent', '--tries', '--timeout', '--wait', '--directory-prefix',
          '--execute', '--level', '--accept', '--reject', '--domains', '--header', '--post-data', '--post-file', '--body-data', '--body-file', '--method', '--user',
          '--password', '--load-cookies', '--save-cookies', '--base', '--config', '--limit-rate', '--quota', '--referer'] });
      const help = opts.has('-h', '--help', '-V', '--version');
      const inputs = opts.values('-i', '--input-file', '--post-file', '--body-file');
      if (help) set(0, unused(0, 'wget prints help or version information without reading stdin.'));
      else if (inputs.includes('-')) set(0, possible(0, 'wget reads URLs or request data from stdin when -i or a body file is “-”.'));
      else if (inputs.every(file => !descriptorPath(file))) set(0, unused(0, 'wget downloads the URLs in its arguments or input file; it does not read stdin.'));
      if (!help && !opts.values('-O', '--output-document', '-o', '--output-file', '-a', '--append-output').some(file => file === '-' || stdoutPath(file))) {
        set(1, unused(1, 'wget saves downloads to files and logs to stderr; it writes nothing to stdout.'));
      }
      const logFile = opts.values('-o', '--output-file', '-a', '--append-output').length > 0;
      if (!opts.has('-q', '--quiet') && !logFile) set(2, usage('possible', 'log + errors', 'wget logs its progress to stderr unless -q or -o is given, and may write diagnostics.'));
    }
  },
};
