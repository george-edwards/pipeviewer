// Training compares pictures, not spellings: two command lines match when they draw the same cards
// with the same words and send every descriptor to the same place. So `sort <in >out`,
// `sort 0<in 1>out` and `>out sort <in` all match one another.
import { targetsOf } from './parser.js';

const names = ['stdin', 'stdout', 'stderr'];

// A destination as the picture shows it. Files are told apart by name and by how they are opened;
// pipes, substitutions and the terminal by their endpoint, which the parser names by position.
function where(dest) {
  if (!dest) return 'none';
  if (dest.type === 'multio') return dest.targets.map(where).join(' + ');
  if (['file', 'null'].includes(dest.type)) return `${dest.mode}:${dest.label}`;
  if (dest.type === 'closed') return 'closed';
  return dest.id;
}

// Where a descriptor leads, in words, for the list of differences.
export function describe(dest, fd) {
  if (!dest) return 'not open';
  if (dest.type === 'multio') return targetsOf(dest).map(target => describe(target, fd)).join(' and ');
  if (dest.type === 'terminal') {
    if (dest.id === 'terminal-in') return 'the terminal (keyboard)';
    if (fd === 1 && dest.id === 'terminal-err') return 'the terminal, as stderr';
    if (fd === 2 && dest.id === 'terminal-out') return 'the terminal, as stdout';
    return 'the terminal';
  }
  if (dest.type === 'null') return '/dev/null';
  if (dest.type === 'file') return dest.mode === 'read' ? dest.label : `${dest.label} (${dest.mode === 'append' ? 'append' : 'overwrite'})`;
  if (dest.type === 'pipe') return fd === 0 ? `a pipe from ${dest.commands[dest.from].usage.name}` : `a pipe to ${dest.commands[dest.to].usage.name}`;
  if (dest.type === 'closed') return 'nothing (closed)';
  if (dest.type === 'procsub') return dest.label;
  if (dest.type === 'job') return dest.job.owner.usage.name;
  return dest.label;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The differences between the student's picture and the target's, each with the card and port it
// concerns so the drawing can mark them. An empty list means the pictures match.
export function compare(target, yours) {
  if (target.pipelines.length !== yours.pipelines.length) {
    return [{ kind: 'shape', text: `Yours runs ${plural(yours.pipelines.length, 'pipeline')}, one after another; the target runs ${target.pipelines.length}.` }];
  }
  const shape = target.pipelines.map((pipeline, n) => {
    const other = yours.pipelines[n], label = target.pipelines.length > 1 ? `Pipeline ${n + 1}: yours` : 'Yours';
    if (pipeline.commands.length !== other.commands.length) return { kind: 'shape', text: `${label} has ${plural(other.commands.length, 'command')} joined by pipes; the target has ${pipeline.commands.length}.` };
    if (pipeline.all.length !== other.all.length || pipeline.all.some((cmd, i) => cmd.key !== other.all[i].key)) {
      return { kind: 'shape', text: `${label} draws ${plural(other.all.length, 'card')}, counting process substitutions and jobs; the target draws ${pipeline.all.length}.` };
    }
    if (n && pipeline.operator !== other.operator) return { kind: 'shape', text: `Pipeline ${n + 1} follows ${other.operator} in yours, but ${pipeline.operator} in the target.` };
    return null;
  }).filter(Boolean);
  if (shape.length) return shape;
  const byKey = new Map(yours.all.map(cmd => [cmd.key, cmd]));
  const differences = [];
  for (const cmd of target.all) {
    const mine = byKey.get(cmd.key);
    if (JSON.stringify(cmd.args) !== JSON.stringify(mine.args)) {
      differences.push({ kind: 'command', key: cmd.key, target: cmd.command, yours: mine.command });
    }
    const fds = [...new Set([...Object.keys(cmd.fds), ...Object.keys(mine.fds)])].map(Number).sort((a, b) => a - b);
    for (const fd of fds) {
      if (where(cmd.fds[fd]) === where(mine.fds[fd])) continue;
      differences.push({ kind: 'stream', key: cmd.key, fd, name: names[fd] ?? `fd ${fd}`, command: cmd.usage.name, target: describe(cmd.fds[fd], fd), yours: describe(mine.fds[fd], fd) });
    }
    // Files the command opens itself, as tee does.
    const opens = list => (list ?? []).map(open => where(open.endpoint)).join(', ');
    if (opens(cmd.opens) !== opens(mine.opens)) {
      const named = list => (list ?? []).map(open => open.endpoint.label).join(', ') || 'none';
      differences.push({ kind: 'opens', key: cmd.key, command: cmd.usage.name, target: named(cmd.opens), yours: named(mine.opens) });
    }
  }
  return differences;
}

// Stars for a solved level: three, less one for each hint taken, but never fewer than one.
export const starsFor = hints => Math.max(1, 3 - hints);
