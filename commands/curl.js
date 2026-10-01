import { usage, unused, possible, unknownInput, stdoutPath, lenientOptions } from './helpers.js';

export default {
  names: ['curl'],
  infer({ name, args, literalArgs, set, output, errors }) {
    errors();
    output('curl writes the response body to stdout unless -o or -O saves it; -w and some trace options also write stdout.');
    if (literalArgs) {
      const opts = lenientOptions(args, { shortValues: 'AbcCdDeEFhHKmoPQrtTuUwxXyYz',
        longValues: ['--data', '--data-ascii', '--data-binary', '--data-raw', '--data-urlencode', '--json', '--form', '--form-string', '--upload-file', '--config',
          '--output', '--output-dir', '--write-out', '--dump-header', '--trace', '--trace-ascii', '--stderr', '--header', '--user-agent', '--request', '--url', '--user',
          '--proxy', '--max-time', '--connect-timeout', '--retry', '--cookie', '--cookie-jar', '--referer', '--range', '--cert', '--key', '--cacert', '--variable'] });
      // “-” and “@-” name stdin in data, form, upload and config values; for output options “-” is stdout.
      const writers = ['-o', '--output', '-D', '--dump-header', '--trace', '--trace-ascii', '--stderr', '-c', '--cookie-jar', '-w', '--write-out'];
      const inputs = opts.options.filter(([key, value]) => typeof value === 'string' && !writers.includes(key)).map(([, value]) => value);
      const uploads = opts.values('-T', '--upload-file');
      if (opts.has('-h', '--help', '-V', '--version')) set(0, unused(0, 'curl prints help or version information without reading stdin.'));
      else if (inputs.some(value => /(?:^|[@<])-$/.test(value)) || uploads.includes('.')) set(0, possible(0, 'curl reads upload data, form fields or its config from stdin when a value names “-”.'));
      else if (inputs.some(value => /(?:^|[@<])\/(?:dev|proc)\//.test(value)) || opts.has('-K', '--config')) set(0, unknownInput(name));
      else set(0, unused(0, 'curl sends data from its arguments and named files; these arguments do not read stdin.'));
      const urls = opts.operands.filter(value => value.includes('://')).length + opts.values('--url').length;
      const saved = opts.values('-o', '--output').filter(file => file !== '-' && !stdoutPath(file)).length + (opts.has('-O', '--remote-name', '--remote-name-all') ? urls : 0);
      const toStdout = opts.has('-w', '--write-out') || opts.values('-o', '--output', '-D', '--dump-header', '--trace', '--trace-ascii', '--stderr').includes('-');
      if (urls > 0 && saved >= urls && !toStdout && !opts.has('-h', '--help', '-V', '--version')) set(1, unused(1, 'curl saves every response to a file and nothing else is sent to stdout.'));
      if (!opts.has('-s', '--silent')) set(2, usage('possible', 'progress + errors', 'curl shows a progress meter on stderr when its output is not a terminal, and may write diagnostics.'));
    }
  },
};
