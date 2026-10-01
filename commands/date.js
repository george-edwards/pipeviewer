import { unused, possible, unknownInput, descriptorPath, scanOptions, fileInput } from './helpers.js';

export default {
  names: ['date'],
  infer({ name, args, set, output, errors }) {
    output('date writes the date and time, or with -f, one line for each date it reads.'); errors();
    // -I takes an optional attached value, such as -Iseconds, which the scanner cannot express.
    const scan = scanOptions(args.filter(arg => !/^-I\w*$/.test(arg.value)), { flags: 'Ru', values: 'dfrs', longFlags: ['--debug', '--iso-8601', '--rfc-email', '--utc', '--universal'],
      longValues: ['--date', '--file', '--iso-8601', '--rfc-3339', '--reference', '--set'] });
    if (scan.help) set(0, fileInput(name, scan));
    else if (scan.valid) {
      const file = scan.options.get('-f') ?? scan.options.get('--file');
      if (file === undefined) set(0, unused(0, 'date formats the current time, or a date from its arguments; it does not read stdin.'));
      else if (file === '-') set(0, possible(0, 'date -f - reads one date per line from stdin.'));
      else if (descriptorPath(file)) set(0, unknownInput(name));
      else set(0, unused(0, 'date -f reads dates from the named file, not stdin.'));
    }
  },
};
