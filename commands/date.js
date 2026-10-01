import { unused, possible, unknownInput, descriptorPath, scanOptions, fileInput } from './helpers.js';

export default {
  names: ['date'],
  infer({ name, args, set, output, errors, platform }) {
    output('date writes the date and time, or with -f, one line for each date it reads.'); errors();
    // BSD date's -f is the format for parsing a date argument, not a file of dates.
    if (platform === 'macos') {
      set(0, unused(0, 'BSD date formats the current time, or a date in its arguments; -f gives that date’s format. It never reads stdin.'));
      return;
    }
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
