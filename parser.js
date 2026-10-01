import { inferUsage, substitutionUsage, fillReplacements, targetsOf, reaches } from './usage.js';

export { targetsOf, reaches };

/**
 * A deliberately limited shell parser. Input is never evaluated or executed.
 * Each token's span is where it sits in the text the viewer typed: at() maps an index in source
 * there, which differs for a parallel job's command, rebuilt from its quoted words.
 */
// comments is false for zsh, where # starts a comment only in scripts, not at an interactive prompt.
function tokenize(source, start = 0, nested = false, at = i => i, comments = true) {
  const tokens = [];
  let i = start;
  while (i < source.length) {
    if (/[ \t\r]/.test(source[i])) { i++; continue; }
    if (source[i] === '\\' && source[i + 1] === '\n') { i += 2; continue; }
    if (comments && source[i] === '#') { while (i < source.length && source[i] !== '\n') i++; continue; }
    // A newline ends a command like ; does, so a short script of several lines can be pasted.
    if (source[i] === '\n') { tokens.push({ type: 'op', value: ';', newline: true, raw: '\n', start: i, end: i + 1, span: [at(i), at(i) + 1] }); i++; continue; }
    const begin = i;
    if (/^[<>]\(/.test(source.slice(i, i + 2))) {
      // Bash joins adjacent text into one word, so 2>(cat) is an argument, not a redirect.
      if (i > start && !/[\s(]/.test(source[i - 1])) {
        throw new Error(/\d/.test(source[i - 1])
          ? `Bash reads ${source[i - 1]}${source.slice(i, i + 2)}…) as an argument. Write ${source[i - 1]}${source[i]} ${source.slice(i, i + 2)}…) to redirect a descriptor.`
          : `Put a space before ${source.slice(i, i + 2)}…). Bash joins it to the neighbouring word.`);
      }
      const inner = tokenize(source, i + 2, true, at, comments);
      i = inner.end + 1;
      if (i < source.length && !/[\s|&;<>()]/.test(source[i])) throw new Error('Put a space after the closing ) of a process substitution. Bash joins adjacent text into one word.');
      if (!inner.tokens.length) throw new Error(`Add a command inside ${source[begin]}( ).`);
      tokens.push({ type: 'procsub', direction: source[begin], tokens: inner.tokens, raw: source.slice(begin, i), start: begin, end: i, span: [at(begin), at(i - 1) + 1] });
      continue;
    }
    const operator = source.slice(i).match(/^(\|&|\|\||&&|&>>|&>|>>|>&|<&|<<<|<<|<>|>\||[|<>;&()])/);
    if (operator) {
      if (nested && operator[0] === ')') return { tokens, end: begin };
      i += operator[0].length;
      tokens.push({ type: 'op', value: operator[0], raw: operator[0], start: begin, end: i, span: [at(begin), at(i - 1) + 1] });
      continue;
    }
    // positions[k] is where value[k] came from, so a job's command can be traced back too.
    let value = '', quote = '', dynamic = false;
    const positions = [];
    while (i < source.length) {
      const c = source[i];
      if (!quote && /[\s|<>;&()]/.test(c)) break;
      if (c === '\\' && quote !== "'") {
        if (i + 1 >= source.length) throw new Error('A trailing backslash needs another character.');
        const next = source[i + 1];
        if (quote === '"' && !['$', '`', '"', '\\', '\n'].includes(next)) { value += c; positions.push(at(i)); i++; continue; }
        if (next !== '\n') { value += next; positions.push(at(i + 1)); }
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
      value += c; positions.push(at(i)); i++;
    }
    if (quote) throw new Error(`Close the ${quote === "'" ? 'single' : 'double'} quote to see your pipeline.`);
    tokens.push({ type: 'word', value, raw: source.slice(begin, i), start: begin, end: i, span: [at(begin), at(i - 1) + 1], positions, dynamic });
  }
  if (nested) throw new Error('Close the process substitution with ).');
  return { tokens, end: i };
}

const letters = 'abcdefghijklmnopqrstuvwxyz';
// fill turns placeholders the tool fills in, such as parallel's {}, into literal words.
const fillAll = (tokens, fill = fillReplacements) => tokens.map(token => token.type === 'procsub' ? { ...token, tokens: fillAll(token.tokens, fill) } : token.type === 'word' ? fill(token) : token);
// In a script run by sh -c, $1, $@ and the like are the items xargs passes, so they act like {}.
const fillPositional = word => word.dynamic && !/[$*?[\]{}~]/.test(word.raw.replace(/\$(?:\{[0-9@*#]\}|[0-9@*#])/g, '')) ? { ...word, dynamic: false } : fillReplacements(word);

/**
 * GNU parallel runs its command through a shell once per argument. When that command parses,
 * it becomes a job template below parallel. Jobs start after parallel's redirects apply. By
 * default parallel collects their output; with -u they write to its stdout and stderr directly.
 */
// The tool is parallel, or xargs running a shell script per item (xargs sh -c '…'). A job names
// its own shell when it has one: sh -c scripts follow Bash's rules even under zsh.
function addJob(cmd, context, shell) {
  const { source, positions, input, ungroup, tool = 'parallel' } = cmd.usage.job;
  const saved = { substitutions: context.substitutions.length, owned: cmd.substitutions.length, endpoints: new Set(context.endpoints.keys()) };
  try {
    const tokens = fillAll(tokenize(source, 0, false, i => positions[Math.min(i, positions.length - 1)]).tokens, tool === 'xargs' ? fillPositional : fillReplacements);
    const job = { ...cmd.usage.job, tool, id: `job-${context.substitutions.length}`, kind: 'job', key: `${cmd.key}j`, text: source, owner: cmd };
    const collected = ungroup ? null : context.endpoint(`${job.id}-out`, 'job', tool, { owner: cmd, job, direction: '<' });
    const stdin = input === 'blocks' ? context.endpoint(`${job.id}-in`, 'job', tool, { owner: cmd, job, direction: '>' })
      : input === 'terminal' ? context.endpoint('terminal-in')
        : input === 'inherit' ? cmd.fds[0]
          : context.endpoint(`${job.id}-null`, 'null', '/dev/null', { mode: 'read', job });
    cmd.substitutions.push(job);
    context.substitutions.push(job);
    Object.assign(job, buildPipeline(tokens, { 0: stdin, 1: ungroup ? cmd.fds[1] : collected, 2: ungroup ? cmd.fds[2] : collected }, context, job, { shell: job.shell ?? shell }));
  } catch (error) {
    context.substitutions.length = saved.substitutions;
    cmd.substitutions.length = saved.owned;
    for (const id of [...context.endpoints.keys()]) if (!saved.endpoints.has(id)) context.endpoints.delete(id);
    context.notes.push(`The ${tool} job command is shown as an argument. ${error.message}`);
  }
}

/**
 * Builds one pipeline. Process substitutions recurse with a snapshot of the owning
 * command's descriptors, taken when Bash expands the word (left to right).
 *
 * zsh (the macOS shell) differs in three ways that change the map:
 * - MULTIOS: a descriptor keeps a list of targets. In a pipeline it starts with the pipe; otherwise
 *   it is inherited from the shell. A redirect replaces an inherited descriptor and adds to any
 *   other, and a copy (n>&m) adds whatever m points at. With two or more targets the command
 *   writes to a pipe, and zsh copies the data to every target, like tee; for input it concatenates.
 * - A process substitution used as an argument gets the shell's descriptors; one used as a
 *   redirect target sees the pipeline's pipes but not the command's own redirects. zsh numbers
 *   them from /dev/fd/11 up rather than down from 63.
 * - Only a single digit can name a descriptor in a redirect, and a command line of only
 *   redirects runs cat (for output) or more (for input).
 */
// first numbers the commands on from earlier pipelines in a list, so every key stays unique.
// shell is 'bash' or 'zsh': whose redirect rules apply. Substitutions inherit it; jobs may name their own.
function buildPipeline(tokens, inherited, context, substitution, { first = 0, prefix: listPrefix = '', shell = context.shell } = {}) {
  const groups = [], connectors = [], connectorTokens = [];
  let current = [];
  for (const token of tokens) {
    if (token.type === 'op' && ['&&', '||', ';'].includes(token.value)) {
      throw new Error(`Use one pipeline inside ${substitution?.kind === 'job' ? 'a parallel job' : 'a process substitution'}; lists with &&, || and ; are only supported at the top level.`);
    }
    if (token.type === 'op' && ['|', '|&'].includes(token.value)) {
      if (!current.length) throw new Error('Each side of a pipe needs a command.');
      groups.push(current); current = []; connectors.push(token.value); connectorTokens.push(token);
    } else current.push(token);
  }
  if (!current.length) throw new Error('Each side of a pipe needs a command.');
  groups.push(current);
  if (!substitution && groups.length > 12) throw new Error('This view supports up to 12 commands in one pipeline.');
  const prefix = substitution ? `${substitution.id}-` : listPrefix;
  const pipes = connectors.map((_, i) => context.endpoint(`${prefix}pipe-${i}`, 'pipe', `Pipe ${i + 1}`, { from: i, to: i + 1, span: connectorTokens[i].span }));
  const commands = [];
  groups.forEach((tokens, index) => {
    const key = substitution ? (groups.length > 1 ? `${substitution.key}.${index + 1}` : substitution.key) : `${first + index + 1}`;
    const fds = { ...inherited, 0: index ? pipes[index - 1] : inherited[0], 1: pipes[index] || inherited[1] };
    const cmd = { index, key, substitution, fds, steps: [], substitutions: [], span: [tokens[0].span[0], tokens.at(-1).span[1]] };
    commands.push(cmd);
    const zsh = shell === 'zsh', initial = { ...fds };
    // zsh target lists; a missing entry means the descriptor is still inherited from the shell.
    const lists = {};
    if (zsh && index) lists[0] = [pipes[index - 1]];
    if (zsh && pipes[index]) lists[1] = [pipes[index]];
    const assign = (fd, added) => {
      if (!zsh) { fds[fd] = added[0]; return; }
      lists[fd] = lists[fd]?.length ? [...lists[fd], ...added] : [...added];
      if (lists[fd].length === 1) { fds[fd] = lists[fd][0]; return; }
      const id = `multio-${key}-${fd}`;
      fds[fd] = { id, type: 'multio', label: lists[fd].map(dest => dest.label).join(' + '), targets: lists[fd], direction: fd === 0 ? 'in' : 'out' };
      context.endpoints.set(id, fds[fd]);
    };
    const substitute = (token, place) => {
      if (cmd.substitutions.length >= letters.length) throw new Error('Use fewer process substitutions in one command.');
      let fd = zsh ? 11 : 63;
      while (fd in fds) fd += zsh ? 1 : -1;
      const sub = { id: `sub-${context.substitutions.length}`, key: `${key}${letters[cmd.substitutions.length]}`, text: token.raw, direction: token.direction, owner: cmd, fd, place, span: token.span };
      sub.endpoint = context.endpoint(sub.id, 'procsub', token.raw, { direction: token.direction, owner: cmd, fd, substitution: sub });
      // The child inherits the owner's current descriptors, except earlier substitution pipes. Under
      // zsh, an argument gets the shell's descriptors, and a redirect target the pipeline's pipes.
      const base = !zsh ? fds : place === 'argument' ? inherited : initial;
      const snapshot = Object.fromEntries(Object.entries(base).filter(([n, dest]) => Number(n) <= 2 || dest.type !== 'procsub'));
      snapshot[token.direction === '>' ? 0 : 1] = sub.endpoint;
      cmd.substitutions.push(sub);
      context.substitutions.push(sub);
      Object.assign(sub, buildPipeline(token.tokens, snapshot, context, sub, { shell }));
      fds[fd] = sub.endpoint;
      return sub;
    };
    const words = [], argv = [];
    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i], fd;
      const first = token;
      if (token.type === 'word' && (zsh ? /^\d$/ : /^\d+$/).test(token.raw) && tokens[i + 1]?.type === 'op' && /^[<>]/.test(tokens[i + 1].value) && token.end === tokens[i + 1].start) {
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
      if (op === '&') throw new Error('Background jobs (&) are not supported yet. Use &&, || or ; to run commands one after another.');
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
      // A copy, or a path such as /dev/stdout, adds every target of the descriptor it names under zsh.
      const added = zsh && ((op === '>&' || op === '<&') && dest.type !== 'closed' || ['/dev/stdin', '/dev/stdout', '/dev/stderr'].includes(target.value)) ? targetsOf(dest) : [dest];
      const touched = op.startsWith('&') ? [1, 2] : [fd];
      for (const n of touched) {
        if (dest.type === 'closed') { fds[n] = dest; lists[n] = []; } else assign(n, added);
      }
      const shared = touched.map(n => fds[n]).find(d => d.type === 'multio');
      const copies = shared ? `; zsh copies it to all ${shared.targets.length}: ${shared.label}` : '';
      cmd.steps.push({ text: `${op.startsWith('&') ? '' : fd}${op}${op.endsWith('&') ? '' : ' '}${target.raw}`, fd, fds: touched, destination: dest, span: [first.span[0], target.span[1]], description: `${op.startsWith('&') ? 'stdout and stderr' : fd} → ${dest.label}${via}${copies}` });
    }
    if (!words.length && zsh && cmd.steps.length) {
      // zsh runs $NULLCMD (cat) for a line of only redirects, or $READNULLCMD (more) if all are input.
      const name = cmd.steps.every(step => step.fds.every(n => n === 0)) ? 'more' : 'cat';
      words.push(name); argv.push({ type: 'word', value: name, raw: name, dynamic: false });
      cmd.implicit = name;
      context.notes.push(name === 'cat'
        ? 'zsh runs cat when a command has only redirects, so it copies stdin into the target until end-of-file. Bash would only create the file.'
        : 'zsh runs more (less on macOS) when a command has only input redirects, so it pages the input to the terminal. Bash would only open the file.');
    }
    if (!words.length) throw new Error('Add a command before or after the redirects.');
    if (argv[0].procsub) throw new Error('Start each command with its name. A process substitution cannot be the command itself.');
    if (['if', 'then', 'for', 'while', 'until', 'case', 'function', '{', '}', '!', 'time', 'exec'].includes(words[0])) throw new Error('Shell control structures and exec are not supported. Try simple commands joined by pipes.');
    if (connectors[index] === '|&') {
      // |& is 2>&1 after the command's own redirects; under zsh it adds stdout's targets to stderr's.
      const destination = fds[1];
      assign(2, targetsOf(destination));
      cmd.steps.push({ text: '|&', fd: 2, fds: [2], destination, span: connectorTokens[index].span, description: `stderr follows stdout → ${fds[2].label}` });
    }
    cmd.command = words.join(' ');
    // Redirects apply before the command runs, so /dev/fd/3 names whatever 3< <(…) opened.
    const substitutionPath = token => !token.dynamic && fds[token.value.match(/^\/(?:dev|proc\/self)\/fd\/(\d+)$/)?.[1]]?.type === 'procsub';
    const paths = argv.map(token => !token.procsub && substitutionPath(token) ? { ...token, procsub: true } : token);
    cmd.usage = inferUsage(paths, context.platform);
    for (const note of [cmd.usage.missing, ...(cmd.usage.notes ?? [])]) if (note && !context.notes.includes(note)) context.notes.push(note);
    for (const sub of cmd.substitutions) {
      cmd.usage.fds[sub.fd] = substitutionUsage(cmd.usage.name, sub.direction, sub.fd, sub.place === 'argument');
      if (sub.place > 2 && fds[sub.place] === sub.endpoint && argv.some(token => substitutionPath(token) && token.value.endsWith(`/fd/${sub.place}`))) {
        cmd.usage.fds[sub.place] = substitutionUsage(cmd.usage.name, sub.direction, sub.place, true);
      }
    }
    if (cmd.usage.job) addJob(cmd, context, shell);
  });
  for (const pipe of pipes) pipe.commands = commands;
  return { commands, pipes };
}

// True when cmd is ancestor or was started by one of its process substitutions.
const startedBy = (cmd, ancestor) => {
  for (let c = cmd; c; c = c.substitution?.owner) if (c === ancestor) return true;
  return false;
};

// Splits a command line at &&, || and ; (or a newline) into the pipelines it runs one after
// another. A newline after |, && or || continues the line, and blank lines are skipped.
function splitList(tokens) {
  const list = [];
  let current = [], operator = null, operatorToken = null;
  for (const token of tokens) {
    const listOp = token.type === 'op' && ['&&', '||', ';'].includes(token.value);
    if (!listOp) { current.push(token); continue; }
    const last = current.at(-1);
    if (token.newline && (!current.length || (last.type === 'op' && ['|', '|&'].includes(last.value)))) continue;
    if (!current.length) {
      if (token.newline || (operator === ';' && token.value === ';' && operatorToken?.newline)) continue;
      throw new Error(token.value === ';' ? 'Put a command before ;.' : `Each side of ${token.value} needs a command.`);
    }
    list.push({ tokens: current, operator, operatorToken });
    current = []; operator = token.value; operatorToken = token;
  }
  if (current.length) list.push({ tokens: current, operator, operatorToken });
  else if (operator === '&&' || operator === '||') throw new Error(`Each side of ${operator} needs a command.`);
  return list;
}

export function parsePipeline(input, { platform = 'linux' } = {}) {
  if (!input.trim()) throw new Error('Paste a command or pipeline to get started.');
  if (input.length > 12000) throw new Error('Try a pipeline shorter than 12,000 characters.');
  const lead = input.length - input.trimStart().length;
  const { tokens } = tokenize(input.trim(), 0, false, i => i + lead, platform !== 'macos');
  const endpoints = new Map();
  const endpoint = (id, type, label, extra = {}) => {
    if (!endpoints.has(id)) endpoints.set(id, { id, type, label, ...extra });
    return endpoints.get(id);
  };
  const context = { endpoint, endpoints, substitutions: [], notes: [], platform, shell: platform === 'macos' ? 'zsh' : 'bash' };
  const terminal = { 0: endpoint('terminal-in', 'terminal', 'Terminal input'), 1: endpoint('terminal-out', 'terminal', 'Terminal output'), 2: endpoint('terminal-err', 'terminal', 'Terminal stderr') };
  const list = splitList(tokens);
  if (!list.length) throw new Error('Paste a command or pipeline to get started.');
  if (list.length > 12) throw new Error('This view supports up to 12 pipelines joined by &&, || or ;.');
  // Every pipeline starts from the shell's own descriptors, after the one before has finished.
  let first = 0;
  const pipelines = list.map(({ tokens: part, operator, operatorToken }, n) => {
    const fromSub = context.substitutions.length, fromNote = context.notes.length;
    const main = buildPipeline(part, terminal, context, null, { first, prefix: n ? `list-${n}-` : '' });
    first += main.commands.length;
    const substitutions = context.substitutions.slice(fromSub);
    const all = [...main.commands, ...substitutions.flatMap(sub => sub.commands)];
    if (all.length - main.commands.length > 12) throw new Error('This view supports up to 12 commands inside process substitutions and parallel jobs.');
    const notes = context.notes.slice(fromNote);
    const where = list.length > 1 ? `In pipeline ${n + 1}, p` : 'P';
    for (const pipeline of [main, ...substitutions]) {
      for (const pipe of pipeline.pipes) {
        // A substitution holds copies of its owner's descriptors, so it can keep a pipe end open.
        pipe.writers = all.filter(cmd => startedBy(cmd, pipeline.commands[pipe.from]) && Object.values(cmd.fds).some(dest => reaches(dest, pipe)));
        pipe.readers = all.filter(cmd => startedBy(cmd, pipeline.commands[pipe.to]) && Object.values(cmd.fds).some(dest => reaches(dest, pipe)));
        const name = `${where}ipe ${pipe.from + 1}${pipeline === main ? '' : ` in ${pipeline.text}`}`;
        if (!pipe.writers.length) notes.push(`${name} has no writer after redirects; its reader receives end-of-file.`);
        if (!pipe.readers.length) notes.push(`${name} has no reader after redirects; writing to it can cause SIGPIPE.`);
      }
    }
    const span = [part[0].span[0], part.at(-1).span[1]];
    return { commands: main.commands, substitutions, all, pipes: main.pipes, notes, operator, newline: !!operatorToken?.newline, operatorSpan: operatorToken?.span, span, index: n };
  });
  const shared = { endpoints: [...endpoints.values()] };
  pipelines.forEach(pipeline => Object.assign(pipeline, shared));
  // A single pipeline is the model itself; a list also flattens its parts for counts and details.
  if (pipelines.length === 1) return { ...pipelines[0], pipelines };
  return {
    commands: pipelines.flatMap(p => p.commands), substitutions: pipelines.flatMap(p => p.substitutions), all: pipelines.flatMap(p => p.all),
    pipes: pipelines.flatMap(p => p.pipes), notes: pipelines.flatMap(p => p.notes), ...shared, pipelines,
  };
}

export function destinationLabel(dest, fd, commands, cmd) {
  if (dest.type === 'multio') return `${dest.direction === 'in' ? 'zsh joins' : 'zsh copies to'}: ${dest.targets.map(target => destinationLabel(target, fd, commands, cmd)).join('; ')}`;
  if (dest.type === 'procsub') {
    if (!cmd || dest.owner === cmd) return `${dest.label} · /dev/fd/${dest.fd}`;
    return `${dest.direction === '>' ? 'Substitution input from' : 'Substitution output to'} ${dest.owner.command}`;
  }
  if (dest.type === 'job') {
    return dest.direction === '>' ? 'Blocks from parallel' : `parallel · collected, then written to its ${fd === 2 ? 'stderr' : 'stdout'}`;
  }
  if (dest.type === 'pipe') {
    const list = dest.commands || commands;
    return fd === 0 ? `Pipe from ${list[dest.from].command}` : `Pipe to ${list[dest.to].command}`;
  }
  if (dest.type === 'null') return `/dev/null · ${dest.mode === 'read' ? 'end-of-file' : 'discard'}`;
  if (dest.type === 'file') return `${dest.label} · ${dest.mode === 'read' ? 'read' : dest.mode === 'append' ? 'append' : 'overwrite'}`;
  return dest.label;
}

/**
 * Rewrites the redirects in source in one of two styles: explicit, which writes the implied
 * descriptor (0< file, 1> file, 1>&2), or common, which leaves it out (< file, > file, >&2).
 * It works on the parser's tokens, so quoted text such as an awk program is never touched, and
 * source that does not parse comes back unchanged.
 */
export function restyle(source, style, { platform = 'linux' } = {}) {
  let tokens;
  try { ({ tokens } = tokenize(source, 0, false, i => i, platform !== 'macos')); } catch { return source; }
  const edits = [];
  const walk = list => list.forEach((token, i) => {
    if (token.type === 'procsub') { walk(token.tokens); return; }
    if (token.type !== 'op') return;
    const input = ['<', '<&', '<>'].includes(token.value), output = ['>', '>>', '>|', '>&'].includes(token.value);
    if (!input && !output) return;
    // >&word copies a descriptor only when word is a number or -; otherwise Bash reads it as &>word.
    if (token.value.endsWith('&') && !/^(?:\d+|-)$/.test(list[i + 1]?.raw ?? '')) return;
    const before = list[i - 1], implied = input ? '0' : '1';
    const numbered = before?.type === 'word' && /^\d+$/.test(before.raw) && before.end === token.start;
    if (style === 'explicit' && !numbered) edits.push([token.start, token.start, implied]);
    if (style === 'common' && numbered && before.raw === implied) edits.push([before.start, before.end, '']);
  });
  walk(tokens);
  return edits.sort((a, b) => b[0] - a[0]).reduce((text, [from, to, insert]) => text.slice(0, from) + insert + text.slice(to), source);
}
