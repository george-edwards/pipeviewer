import { unused, unknownInput, descriptorPath, stdoutPath, scanOptions, fileInput } from './helpers.js';

export default {
  names: ['shuf'],
  macos: false,
  instead: { macos: { '*': 'use sort -R, or jot -r for random numbers' } },
  infer({ name, args, set, output, errors }) {
    output('shuf writes its input lines, the -e arguments or the -i range, in random order.'); errors();
    const scan = scanOptions(args, { flags: 'erz', values: 'ino', longFlags: ['--echo', '--repeat', '--zero-terminated'],
      longValues: ['--input-range', '--head-count', '--output', '--random-source'] });
    const has = (...keys) => keys.some(key => scan.options.has(key));
    if (scan.help) set(0, fileInput(name, scan));
    else if (scan.valid) {
      // --random-source=- names a file called “-”; only a descriptor path could be stdin.
      const random = scan.options.get('--random-source');
      if (random !== undefined && descriptorPath(random)) set(0, unknownInput(name));
      else if (has('-e', '--echo')) set(0, unused(0, 'shuf -e shuffles its arguments; it does not read stdin.'));
      else if (has('-i', '--input-range')) set(0, unused(0, 'shuf -i shuffles a range of numbers; it does not read stdin.'));
      else set(0, fileInput(name, scan, { maxFiles: 1 }));
      const file = scan.options.get('-o') ?? scan.options.get('--output');
      if (file !== undefined && !stdoutPath(file)) set(1, unused(1, 'shuf -o writes the result to the named file instead of stdout.'));
    }
  },
};
