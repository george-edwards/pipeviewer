// Static expectations for standard commands, never runtime observations.
// Unknown commands, wrappers, scripts, expansions, and options stay conservative.
import { usage, possible, unknownInput } from './commands/helpers.js';
import commands from './commands/index.js';

export { hasReplacement, fillReplacements } from './commands/helpers.js';
export { commands };
const streamNames = ['stdin', 'stdout', 'stderr'];
const rules = new Map(commands.flatMap(rule => rule.names.map(name => [name, rule])));

export function inferUsage(argv) {
  // Leading locale and timezone assignments, as in LC_ALL=C sort, change formatting but not which
  // program runs or the streams it uses. Others, such as PATH=…, stay unknown. Quoted words are not assignments.
  const command = argv.findIndex(arg => !/^(?:LC_[A-Z]+|LANG|LANGUAGE|TZ)=/.test(arg.raw ?? arg.value));
  if (command > 0) return inferUsage(argv.slice(command));
  const name = argv[0]?.value || 'command';
  const result = { name, recognised: false, fds: Object.fromEntries(streamNames.map((stream, fd) => [fd,
    usage('unknown', 'usage unknown', `Usage of ${stream} is unknown for this command. A connection does not imply data transfer.`),
  ])) };
  const rule = argv[0] && !argv[0].dynamic && rules.get(name);
  if (!rule) return result;
  const set = (fd, value) => { result.fds[fd] = value; };
  result.recognised = true;
  set(0, unknownInput(name));
  const args = argv.slice(1);
  rule.infer({
    name, args, set,
    literalArgs: args.every(arg => !arg.dynamic),
    output: description => set(1, possible(1, description || `${name} may write results to stdout; the bytes depend on input and options.`)),
    errors: () => set(2, possible(2, `${name} may write diagnostics to stderr; errors are not predicted.`)),
    infer: inferUsage,
    setJob: job => { result.job = job; },
  });
  return result;
}

export function portUsage(command, fd) {
  if (command.fds[fd]?.type === 'closed') return usage('closed', 'closed', 'This descriptor is closed. Attempts to use it fail.');
  return command.usage.fds[fd] || usage('unknown', 'usage unknown', 'Usage of this additional descriptor is unknown.');
}

export function substitutionUsage(name, direction, fd, viaArgument) {
  if (!viaArgument) return usage('unused', 'not used', `Bash keeps /dev/fd/${fd} open, but ${name} reaches the substitution through the redirected descriptor.`);
  return usage('possible', direction === '<' ? 'may read' : 'may write', `${name} receives the path /dev/fd/${fd} as an argument and may open it to ${direction === '<' ? 'read' : 'write'}.`);
}

export function pipeActivity(commands, pipe) {
  const source = commands[pipe.from], target = commands[pipe.to];
  // The parser adds process substitutions that inherited this pipe as writers or readers.
  const writers = (pipe.writers || [source]).flatMap(cmd => Object.entries(cmd.fds).filter(([, dest]) => dest === pipe).map(([fd]) => portUsage(cmd, Number(fd))));
  // Extra descriptors could be used by an unmodelled operation: never infer zero.
  const noWrites = writers.length === 0 || writers.every(state => state.state === 'unused');
  const readers = (pipe.readers || [target]).filter(cmd => cmd.fds[0] === pipe);
  const notRead = target.fds[0] === pipe && readers.every(cmd => portUsage(cmd, 0).state === 'unused');
  return {
    noWrites, notRead,
    label: noWrites ? 'pipe · no writes' : notRead ? 'pipe · not read' : 'pipe',
    reason: noWrites
      ? 'The pipe is connected, but no writes are expected from its connected descriptors. This is inferred, not measured.'
      : notRead ? `${target.usage.name} does not read its stdin. The producer may still write; this does not imply zero bytes or a successful write.`
        : 'The pipe connects descriptors. Whether bytes flow depends on the commands and their input.',
  };
}
