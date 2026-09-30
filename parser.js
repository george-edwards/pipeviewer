/** A deliberately limited shell parser. Input is never evaluated or executed. */
function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    if (/[ \t\r]/.test(source[i])) { i++; continue; }
    if (source[i] === '\\' && source[i + 1] === '\n') { i += 2; continue; }
    if (source[i] === '#') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (source[i] === '\n') throw new Error('Enter one pipeline. Use a backslash to continue it onto another line.');
    const start = i;
    const operator = source.slice(i).match(/^(\|&|\|\||&&|&>>|&>|>>|>&|<&|<<<|<<|<>|>\||[|<>;&()])/);
    if (operator) {
      i += operator[0].length;
      tokens.push({ type: 'op', value: operator[0], raw: operator[0], start, end: i });
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
    tokens.push({ type: 'word', value, raw: source.slice(start, i), start, end: i, dynamic });
  }
  return tokens;
}

export function parsePipeline(input) {
  if (!input.trim()) throw new Error('Paste a command or pipeline to get started.');
  if (input.length > 12000) throw new Error('Try a pipeline shorter than 12,000 characters.');
  const tokens = tokenize(input.trim());
  const commands = [];
  const connectors = [];
  let current = [];
  for (const token of tokens) {
    if (token.type === 'op' && ['|', '|&'].includes(token.value)) {
      if (!current.length) throw new Error('Each side of a pipe needs a command.');
      commands.push(current); current = []; connectors.push(token.value);
    } else current.push(token);
  }
  if (!current.length) throw new Error('Each side of a pipe needs a command.');
  commands.push(current);
  if (commands.length > 12) throw new Error('This view supports up to 12 commands in one pipeline.');
  const endpoints = new Map();
  const endpoint = (id, type, label, extra = {}) => {
    if (!endpoints.has(id)) endpoints.set(id, { id, type, label, ...extra });
    return endpoints.get(id);
  };
  const terminalIn = endpoint('terminal-in', 'terminal', 'Terminal input');
  const terminalOut = endpoint('terminal-out', 'terminal', 'Terminal output');
  const terminalErr = endpoint('terminal-err', 'terminal', 'Terminal stderr');
  const pipes = connectors.map((_, i) => endpoint(`pipe-${i}`, 'pipe', `Pipe ${i + 1}`, { from: i, to: i + 1 }));
  const result = commands.map((tokens, index) => {
    const fds = { 0: index ? pipes[index - 1] : terminalIn, 1: pipes[index] || terminalOut, 2: terminalErr };
    const words = [], steps = [];
    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i], fd;
      if (token.type === 'word' && /^\d+$/.test(token.raw) && tokens[i + 1]?.type === 'op' && /^[<>]/.test(tokens[i + 1].value) && token.end === tokens[i + 1].start) {
        fd = Number(token.value); token = tokens[++i];
      }
      if (token.type === 'word') { words.push(token.raw); continue; }
      const op = token.value;
      if (!['<', '>', '>>', '>|', '>&', '<&', '&>', '&>>'].includes(op)) {
        throw new Error(`“${op}” is not supported yet. Use simple commands, pipes, and file or descriptor redirects.`);
      }
      const target = tokens[++i];
      if (!target || target.type !== 'word') throw new Error(`Add a destination after ${op}.`);
      if (target.dynamic) throw new Error('Use a literal redirect destination. Variables and filename expansion cannot be resolved here.');
      fd ??= op.startsWith('<') ? 0 : 1;
      if (fd > 255) throw new Error('Use file descriptors between 0 and 255.');
      let dest;
      if (op === '>&' || op === '<&') {
        if (target.value === '-') dest = endpoint('closed', 'closed', 'Closed');
        else if (/^\d+$/.test(target.value)) {
          dest = fds[Number(target.value)];
          if (!dest || dest.type === 'closed') throw new Error(`Descriptor ${target.value} is not open in this command.`);
        } else throw new Error(`Use a descriptor number or “-” after ${op}. For files, use > or &>.`);
      } else {
        if (!target.value) throw new Error('A redirect needs a nonempty filename.');
        const mode = op.includes('>>') ? 'append' : op === '<' ? 'read' : 'write';
        dest = endpoint(`file-${index}-${i}`, target.value === '/dev/null' ? 'null' : 'file', target.value, { mode });
      }
      fds[fd] = dest;
      if (op.startsWith('&')) fds[2] = dest;
      steps.push({ text: `${op.startsWith('&') ? '' : fd}${op} ${target.raw}`, fd, destination: dest, description: op.startsWith('&') ? `stdout and stderr → ${dest.label}` : `${fd} → ${dest.label}` });
    }
    if (!words.length) throw new Error('Add a command before or after the redirects.');
    if (['if', 'then', 'for', 'while', 'until', 'case', 'function', '{', '}', '!', 'time', 'exec'].includes(words[0])) throw new Error('Shell control structures and exec are not supported. Try simple commands joined by pipes.');
    if (connectors[index] === '|&') {
      fds[2] = fds[1];
      steps.push({ text: '|&', fd: 2, destination: fds[1], description: `stderr follows stdout → ${fds[1].label}` });
    }
    return { index, command: words.join(' '), fds, steps };
  });
  const notes = [];
  for (const pipe of pipes) {
    const writers = Object.values(result[pipe.from].fds).some(dest => dest === pipe);
    const readers = Object.values(result[pipe.to].fds).some(dest => dest === pipe);
    if (!writers) notes.push(`Pipe ${pipe.from + 1} has no writer after redirects; its reader receives end-of-file.`);
    if (!readers) notes.push(`Pipe ${pipe.from + 1} has no reader after redirects; writing to it can cause SIGPIPE.`);
  }
  return { commands: result, endpoints: [...endpoints.values()], pipes, notes };
}

export function destinationLabel(dest, fd, commands) {
  if (dest.type === 'pipe') return fd === 0 ? `Pipe from ${commands[dest.from].command}` : `Pipe to ${commands[dest.to].command}`;
  if (dest.type === 'null') return `/dev/null · ${dest.mode === 'read' ? 'end-of-file' : 'discard'}`;
  if (dest.type === 'file') return `${dest.label} · ${dest.mode === 'read' ? 'read' : dest.mode === 'append' ? 'append' : 'overwrite'}`;
  return dest.label;
}
