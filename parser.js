import { inferUsage, substitutionUsage } from './usage.js';

/** A deliberately limited shell parser. Input is never evaluated or executed. */
function tokenize(source, start = 0, nested = false) {
  const tokens = [];
  let i = start;
  while (i < source.length) {
    if (/[ \t\r]/.test(source[i])) { i++; continue; }
    if (source[i] === '\\' && source[i + 1] === '\n') { i += 2; continue; }
    if (source[i] === '#') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (source[i] === '\n') throw new Error('Enter one pipeline. Use a backslash to continue it onto another line.');
    const begin = i;
    if (/^[<>]\(/.test(source.slice(i, i + 2))) {
      // Bash joins adjacent text into one word, so 2>(cat) is an argument, not a redirect.
      if (i > start && !/[\s(]/.test(source[i - 1])) {
        throw new Error(/\d/.test(source[i - 1])
          ? `Bash reads ${source[i - 1]}${source.slice(i, i + 2)}…) as an argument. Write ${source[i - 1]}${source[i]} ${source.slice(i, i + 2)}…) to redirect a descriptor.`
          : `Put a space before ${source.slice(i, i + 2)}…). Bash joins it to the neighbouring word.`);
      }
      const inner = tokenize(source, i + 2, true);
      i = inner.end + 1;
      if (i < source.length && !/[\s|&;<>()]/.test(source[i])) throw new Error('Put a space after the closing ) of a process substitution. Bash joins adjacent text into one word.');
      if (!inner.tokens.length) throw new Error(`Add a command inside ${source[begin]}( ).`);
      tokens.push({ type: 'procsub', direction: source[begin], tokens: inner.tokens, raw: source.slice(begin, i), start: begin, end: i });
      continue;
    }
    const operator = source.slice(i).match(/^(\|&|\|\||&&|&>>|&>|>>|>&|<&|<<<|<<|<>|>\||[|<>;&()])/);
    if (operator) {
      if (nested && operator[0] === ')') return { tokens, end: begin };
      i += operator[0].length;
      tokens.push({ type: 'op', value: operator[0], raw: operator[0], start: begin, end: i });
      continue;
    }
    let value = '', quote = '', dynamic = false;
    while (i < source.length) {
      const c = source[i];
      if (!quote && /[\s|<>;&()]/.test(c)) break;
      if (c === '\\' && quote !== "'") {
        if (i + 1 >= source.length) throw new Error('A trailing backslash needs another character.');
        const next = source[i + 1];
        if (quote === '"' && !['$', '`', '"', '\\', '\n'].includes(next)) { value += c; i++; continue; }
        if (next !== '\n') value += next;
        i += 2; continue;
      }
      if ((c === "'" || c === '"') && (!quote || quote === c)) {
        quote = quote ? '' : c; i++; continue;
      }
      if (quote !== "'" && (c === '`' || (c === '$' && source[i + 1] === '('))) {
        throw new Error('Command substitutions are not supported. Try a pipeline of simple commands.');
      }
      if (quote !== "'" && c === '$') dynamic = true;
      if (!quote && /[*?\[\]{}~]/.test(c)) dynamic = true;
      value += c; i++;
    }
    if (quote) throw new Error(`Close the ${quote === "'" ? 'single' : 'double'} quote to see your pipeline.`);
    tokens.push({ type: 'word', value, raw: source.slice(begin, i), start: begin, end: i, dynamic });
  }
  if (nested) throw new Error('Close the process substitution with ).');
  return { tokens, end: i };
}

const letters = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Builds one pipeline. Process substitutions recurse with a snapshot of the owning
 * command's descriptors, taken when Bash expands the word (left to right).
 */
function buildPipeline(tokens, inherited, context, substitution) {
  const groups = [], connectors = [];
  let current = [];
  for (const token of tokens) {
    if (token.type === 'op' && ['|', '|&'].includes(token.value)) {
      if (!current.length) throw new Error('Each side of a pipe needs a command.');
      groups.push(current); current = []; connectors.push(token.value);
    } else current.push(token);
  }
  if (!current.length) throw new Error('Each side of a pipe needs a command.');
  groups.push(current);
  if (!substitution && groups.length > 12) throw new Error('This view supports up to 12 commands in one pipeline.');
  const prefix = substitution ? `${substitution.id}-` : '';
  const pipes = connectors.map((_, i) => context.endpoint(`${prefix}pipe-${i}`, 'pipe', `Pipe ${i + 1}`, { from: i, to: i + 1 }));
  const commands = [];
  groups.forEach((tokens, index) => {
    const key = substitution ? (groups.length > 1 ? `${substitution.key}.${index + 1}` : substitution.key) : `${index + 1}`;
    const fds = { ...inherited, 0: index ? pipes[index - 1] : inherited[0], 1: pipes[index] || inherited[1] };
    const cmd = { index, key, substitution, fds, steps: [], substitutions: [] };
    commands.push(cmd);
    const substitute = (token, place) => {
      if (cmd.substitutions.length >= letters.length) throw new Error('Use fewer process substitutions in one command.');
      let fd = 63;
      while (fd in fds) fd--;
      const sub = { id: `sub-${context.substitutions.length}`, key: `${key}${letters[cmd.substitutions.length]}`, text: token.raw, direction: token.direction, owner: cmd, fd, place };
      sub.endpoint = context.endpoint(sub.id, 'procsub', token.raw, { direction: token.direction, owner: cmd, fd, substitution: sub });
      // The child inherits the owner's current descriptors, except earlier substitution pipes.
      const snapshot = Object.fromEntries(Object.entries(fds).filter(([n, dest]) => Number(n) <= 2 || dest.type !== 'procsub'));
      snapshot[token.direction === '>' ? 0 : 1] = sub.endpoint;
      cmd.substitutions.push(sub);
      context.substitutions.push(sub);
      Object.assign(sub, buildPipeline(token.tokens, snapshot, context, sub));
      fds[fd] = sub.endpoint;
      return sub;
    };
    const words = [], argv = [];
    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i], fd;
      if (token.type === 'word' && /^\d+$/.test(token.raw) && tokens[i + 1]?.type === 'op' && /^[<>]/.test(tokens[i + 1].value) && token.end === tokens[i + 1].start) {
        fd = Number(token.value); token = tokens[++i];
      }
      if (token.type === 'word') { words.push(token.raw); argv.push(token); continue; }
      if (token.type === 'procsub') {
        // As an argument, the command receives a /dev/fd path to the substitution's pipe.
        const sub = substitute(token, 'argument');
        words.push(token.raw);
        argv.push({ type: 'word', value: `/dev/fd/${sub.fd}`, raw: token.raw, dynamic: false, procsub: true });
        continue;
      }
      const op = token.value;
      if (!['<', '>', '>>', '>|', '>&', '<&', '&>', '&>>'].includes(op)) {
        throw new Error(`“${op}” is not supported yet. Use simple commands, pipes, process substitutions, and file or descriptor redirects.`);
      }
      const target = tokens[++i];
      if (!target || !['word', 'procsub'].includes(target.type)) throw new Error(`Add a destination after ${op}.`);
      if (target.dynamic) throw new Error('Use a literal redirect destination. Variables and filename expansion cannot be resolved here.');
      fd ??= op.startsWith('<') ? 0 : 1;
      if (fd > 255) throw new Error('Use file descriptors between 0 and 255.');
      let dest, via = '';
      if (target.type === 'procsub') {
        if (op === '>&' || op === '<&') throw new Error(`Use a descriptor number or “-” after ${op}. For a process substitution, write ${op[0]} ${target.raw}.`);
        if ((op === '<') !== (target.direction === '<')) {
          throw new Error(op === '<' ? `Read from <(…) with < <(command), not < ${target.raw}.` : `Write to >(…) with ${op} >(command), not ${op} ${target.raw}.`);
        }
        const sub = substitute(target, fd);
        dest = sub.endpoint;
        via = ` through /dev/fd/${sub.fd}`;
      } else if (op === '>&' || op === '<&') {
        if (target.value === '-') dest = context.endpoint('closed', 'closed', 'Closed');
        else if (/^\d+$/.test(target.value)) {
          dest = fds[Number(target.value)];
          if (!dest || dest.type === 'closed') throw new Error(`Descriptor ${target.value} is not open in this command.`);
        } else throw new Error(`Use a descriptor number or “-” after ${op}. For files, use > or &>.`);
      } else if (target.value === '/dev/tty') {
        // The controlling terminal: the same device the usual descriptors 0–2 start on.
        dest = context.endpoint(op === '<' ? 'terminal-in' : fd === 2 && !op.startsWith('&') ? 'terminal-err' : 'terminal-out');
        via = ' (/dev/tty)';
      } else if (['/dev/stdin', '/dev/stdout', '/dev/stderr'].includes(target.value)) {
        // Bash opens the descriptor's current destination, much like a copy with >& or <&.
        const source = ['/dev/stdin', '/dev/stdout', '/dev/stderr'].indexOf(target.value);
        dest = fds[source];
        if (!dest || dest.type === 'closed') throw new Error(`${target.value} refers to descriptor ${source}, which is not open in this command.`);
        // A file is opened again, so the two descriptors do not share an offset.
        via = dest.type === 'file' ? ` (${target.value} opens the file again with its own offset, so writes can overwrite each other)` : ` (${target.value})`;
      } else {
        if (!target.value) throw new Error('A redirect needs a nonempty filename.');
        const mode = op.includes('>>') ? 'append' : op === '<' ? 'read' : 'write';
        dest = context.endpoint(`file-${key}-${i}`, target.value === '/dev/null' ? 'null' : 'file', target.value, { mode });
      }
      fds[fd] = dest;
      if (op.startsWith('&')) fds[2] = dest;
      cmd.steps.push({ text: `${op.startsWith('&') ? '' : fd}${op} ${target.raw}`, fd, destination: dest, description: `${op.startsWith('&') ? 'stdout and stderr' : fd} → ${dest.label}${via}` });
    }
    if (!words.length) throw new Error('Add a command before or after the redirects.');
    if (argv[0].procsub) throw new Error('Start each command with its name. A process substitution cannot be the command itself.');
    if (['if', 'then', 'for', 'while', 'until', 'case', 'function', '{', '}', '!', 'time', 'exec'].includes(words[0])) throw new Error('Shell control structures and exec are not supported. Try simple commands joined by pipes.');
    if (connectors[index] === '|&') {
      fds[2] = fds[1];
      cmd.steps.push({ text: '|&', fd: 2, destination: fds[1], description: `stderr follows stdout → ${fds[1].label}` });
    }
    cmd.command = words.join(' ');
    // Redirects apply before the command runs, so /dev/fd/3 names whatever 3< <(…) opened.
    const substitutionPath = token => !token.dynamic && fds[token.value.match(/^\/(?:dev|proc\/self)\/fd\/(\d+)$/)?.[1]]?.type === 'procsub';
    const paths = argv.map(token => !token.procsub && substitutionPath(token) ? { ...token, procsub: true } : token);
    cmd.usage = inferUsage(paths);
    for (const sub of cmd.substitutions) {
      cmd.usage.fds[sub.fd] = substitutionUsage(cmd.usage.name, sub.direction, sub.fd, sub.place === 'argument');
      if (sub.place > 2 && fds[sub.place] === sub.endpoint && argv.some(token => substitutionPath(token) && token.value.endsWith(`/fd/${sub.place}`))) {
        cmd.usage.fds[sub.place] = substitutionUsage(cmd.usage.name, sub.direction, sub.place, true);
      }
    }
  });
  for (const pipe of pipes) pipe.commands = commands;
  return { commands, pipes };
}

// True when cmd is ancestor or was started by one of its process substitutions.
const startedBy = (cmd, ancestor) => {
  for (let c = cmd; c; c = c.substitution?.owner) if (c === ancestor) return true;
  return false;
};

export function parsePipeline(input) {
  if (!input.trim()) throw new Error('Paste a command or pipeline to get started.');
  if (input.length > 12000) throw new Error('Try a pipeline shorter than 12,000 characters.');
  const { tokens } = tokenize(input.trim());
  const endpoints = new Map();
  const endpoint = (id, type, label, extra = {}) => {
    if (!endpoints.has(id)) endpoints.set(id, { id, type, label, ...extra });
    return endpoints.get(id);
  };
  const context = { endpoint, substitutions: [] };
  const terminal = { 0: endpoint('terminal-in', 'terminal', 'Terminal input'), 1: endpoint('terminal-out', 'terminal', 'Terminal output'), 2: endpoint('terminal-err', 'terminal', 'Terminal stderr') };
  const main = buildPipeline(tokens, terminal, context, null);
  const all = [...main.commands, ...context.substitutions.flatMap(sub => sub.commands)];
  if (all.length - main.commands.length > 12) throw new Error('This view supports up to 12 commands inside process substitutions.');
  const notes = [];
  for (const pipeline of [main, ...context.substitutions]) {
    for (const pipe of pipeline.pipes) {
      // A substitution holds copies of its owner's descriptors, so it can keep a pipe end open.
      pipe.writers = all.filter(cmd => startedBy(cmd, pipeline.commands[pipe.from]) && Object.values(cmd.fds).includes(pipe));
      pipe.readers = all.filter(cmd => startedBy(cmd, pipeline.commands[pipe.to]) && Object.values(cmd.fds).includes(pipe));
      const name = `Pipe ${pipe.from + 1}${pipeline === main ? '' : ` in ${pipeline.text}`}`;
      if (!pipe.writers.length) notes.push(`${name} has no writer after redirects; its reader receives end-of-file.`);
      if (!pipe.readers.length) notes.push(`${name} has no reader after redirects; writing to it can cause SIGPIPE.`);
    }
  }
  return { commands: main.commands, substitutions: context.substitutions, all, endpoints: [...endpoints.values()], pipes: main.pipes, notes };
}

export function destinationLabel(dest, fd, commands, cmd) {
  if (dest.type === 'procsub') {
    if (!cmd || dest.owner === cmd) return `${dest.label} · /dev/fd/${dest.fd}`;
    return `${dest.direction === '>' ? 'Substitution input from' : 'Substitution output to'} ${dest.owner.command}`;
  }
  if (dest.type === 'pipe') {
    const list = dest.commands || commands;
    return fd === 0 ? `Pipe from ${list[dest.from].command}` : `Pipe to ${list[dest.to].command}`;
  }
  if (dest.type === 'null') return `/dev/null · ${dest.mode === 'read' ? 'end-of-file' : 'discard'}`;
  if (dest.type === 'file') return `${dest.label} · ${dest.mode === 'read' ? 'read' : dest.mode === 'append' ? 'append' : 'overwrite'}`;
  return dest.label;
}
