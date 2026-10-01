import { usage, unused, possible, unknownInput, descriptorPath, stdoutPath } from './helpers.js';

export default {
  names: ['dd'],
  // dd takes key=value operands rather than options.
  infer({ name, args, literalArgs, set, output }) {
    if (args.length === 1 && ['--help', '--version'].includes(args[0].value)) {
      set(0, unused(0, 'dd prints help or version information without reading stdin.'));
      output('dd prints help or version information to stdout.');
      return;
    }
    set(2, usage('possible', 'stats + errors', 'dd prints transfer statistics to stderr when it finishes, and diagnostics on errors.'));
    if (!literalArgs || args.some(arg => !/^\w+=/.test(arg.value))) return;
    const operand = key => args.map(arg => arg.value).filter(value => value.startsWith(`${key}=`)).at(-1)?.slice(key.length + 1);
    const input = operand('if'), outputFile = operand('of'), status = operand('status');
    if (input === undefined) set(0, possible(0, 'dd copies stdin when no if= is given.'));
    else if (descriptorPath(input)) set(0, unknownInput(name));
    else set(0, unused(0, 'dd reads the if= file instead of stdin.'));
    if (outputFile === undefined || stdoutPath(outputFile)) output('dd writes the copy to stdout when no of= is given.');
    else set(1, unused(1, 'dd writes to the of= file instead of stdout.'));
    if (status === 'none') set(2, possible(2, 'dd status=none prints no statistics; only errors go to stderr.'));
    else if (status === 'progress') set(2, usage('possible', 'progress + stats', 'dd status=progress reports progress on stderr as it copies, then the final statistics.'));
  },
};
