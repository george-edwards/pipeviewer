// Static expectations for standard commands, never runtime observations.
// Unknown commands, wrappers, scripts, expansions, and options stay conservative.
const streamNames = ['stdin', 'stdout', 'stderr'];
const usage = (state, label, reason) => ({ state, label, reason });
const unused = (fd, reason) => usage('unused', fd === 0 ? 'not read' : 'never written', reason);
const possible = (fd, reason) => usage('possible', fd === 0 ? 'may read' : fd === 2 ? 'on error' : 'may write', reason);
const unknownInput = name => usage('unknown', 'usage unknown', `${name}: these arguments do not establish whether stdin is read.`);
const descriptorPattern = /^\/(?:dev\/(?:stdin|fd\/\d+)|proc\/self\/fd\/\d+)$/;
// A /dev/fd path from a process substitution names that substitution's pipe, never stdin.
const descriptorPath = file => typeof file === 'string' ? descriptorPattern.test(file) : !file.procsub && descriptorPattern.test(file.value);

// A small option scanner. It consumes known option values so they are not mistaken for files.
function scanOptions(args, { flags = '', values = '', longFlags = [], longValues = [], stopAtOperand = false } = {}) {
  const files = [], options = new Map();
  let endOptions = false, valid = true, i = 0;
  const longFlagSet = new Set([...longFlags, '--help', '--version']);
  const longValueSet = new Set(longValues);
  for (; i < args.length; i++) {
    const token = args[i], value = token.value;
    if (token.dynamic) { valid = false; break; }
    if (!endOptions && value === '--') { endOptions = true; continue; }
    if (!endOptions && value.startsWith('--')) {
      const [key, attached] = value.includes('=') ? [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)] : [value, null];
      if (longFlagSet.has(value)) { options.set(value, true); continue; }
      if (longValueSet.has(key)) {
        if (attached !== null) options.set(key, attached);
        else if (args[i + 1] && !args[i + 1].dynamic) options.set(key, args[++i].value);
        else { valid = false; break; }
        continue;
      }
      valid = false; break;
    }
    if (!endOptions && value.startsWith('-') && value !== '-') {
      let ok = true;
      for (let j = 1; j < value.length; j++) {
        const key = value[j];
        if (flags.includes(key)) { options.set(`-${key}`, true); continue; }
        if (values.includes(key)) {
          if (j + 1 < value.length) options.set(`-${key}`, value.slice(j + 1));
          else if (args[i + 1] && !args[i + 1].dynamic) options.set(`-${key}`, args[++i].value);
          else ok = false;
          break;
        }
        ok = false; break;
      }
      if (!ok) { valid = false; break; }
      continue;
    }
    if (stopAtOperand) break;
    files.push(token);
  }
  return { files: stopAtOperand ? args.slice(i) : files, options, valid, help: args.length === 1 && ['--help', '--version'].includes(args[0].value) };
}

function fileInput(name, scan, { dashMeansStdin = true, maxFiles = Infinity } = {}) {
  if (scan.help) return unused(0, `${name} prints help or version information without reading stdin.`);
  if (!scan.valid || scan.files.length > maxFiles || scan.files.some(file => file.dynamic)) return unknownInput(name);
  if (scan.files.some(file => descriptorPath(file))) return unknownInput(name);
  if (scan.files.length === 0 || (dashMeansStdin && scan.files.some(file => file.value === '-')))
    return possible(0, `${name} may read stdin when no input files are given${dashMeansStdin ? ' or when “-” names stdin' : ''}.`);
  return unused(0, `${name} reads the named file${scan.files.length === 1 ? '' : 's'} instead of stdin.`);
}

export function inferUsage(argv) {
  const name = argv[0]?.value || 'command';
  const result = { name, recognised: false, fds: Object.fromEntries(streamNames.map((stream, fd) => [fd,
    usage('unknown', 'usage unknown', `Usage of ${stream} is unknown for this command. A connection does not imply data transfer.`),
  ])) };
  if (!argv[0] || argv[0].dynamic) return result;
  const args = argv.slice(1);
  const literalArgs = args.every(arg => !arg.dynamic);
  const set = (fd, value) => { result.fds[fd] = value; };
  const recognise = () => { result.recognised = true; set(0, unknownInput(name)); };
  const errors = () => set(2, possible(2, `${name} may write diagnostics to stderr; errors are not predicted.`));
  const output = description => set(1, possible(1, description || `${name} may write results to stdout; the bytes depend on input and options.`));

  if (name === 'sleep') {
    recognise();
    set(0, unused(0, 'sleep ignores stdin; its delay does not depend on incoming data.'));
    const durations = args[0]?.value === '--' ? args.slice(1) : args;
    const isDelay = literalArgs && durations.length > 0 && durations.every(arg => /^(?:\d+(?:\.\d*)?|\.\d+)(?:[smhd])?$/.test(arg.value));
    if (isDelay) set(1, unused(1, 'sleep does not write to stdout when delaying. This predicts no stdout bytes; it is not a measured count.'));
    else output('sleep may write to stdout for options such as --help or --version; these arguments are not modelled as a delay.');
    errors();
  } else if (name === 'echo' || name === 'printf') {
    recognise();
    set(0, unused(0, `${name} ignores stdin and formats its arguments; it does not wait for input from a pipe.`));
    output(`${name} may write its formatted arguments to stdout. The exact bytes and success of writes are not predicted.`);
    if (name === 'echo' && literalArgs && args[0]?.value === '-n' && (args.length === 1 || (args.length === 2 && args[1].value === ''))) {
      set(1, unused(1, 'echo -n with no text suppresses the newline and writes no stdout data.'));
    }
    errors();
  } else if (['cat', 'wc', 'base64', 'cut', 'paste', 'rev'].includes(name)) {
    recognise(); output(); errors();
    const specs = {
      cat: { flags: 'AbenstuvET', longFlags: ['--show-all', '--number-nonblank', '--show-ends', '--number', '--squeeze-blank', '--show-tabs', '--show-nonprinting'] },
      wc: { flags: 'clmwL', longFlags: ['--bytes', '--chars', '--lines', '--words', '--max-line-length'], longValues: ['--files0-from', '--total'] },
      base64: { flags: 'di', values: 'w', longFlags: ['--decode', '--ignore-garbage'], longValues: ['--wrap'] },
      cut: { flags: 'Fnswz', values: 'bcfdO', longFlags: ['--only-delimited', '--zero-terminated', '--no-partial'], longValues: ['--bytes', '--characters', '--fields', '--delimiter', '--output-delimiter', '--whitespace-delimited'] },
      paste: { flags: 'sz', values: 'd', longFlags: ['--serial', '--zero-terminated'], longValues: ['--delimiters'] },
      rev: { flags: '0', longFlags: ['--zero'] },
    };
    const scan = scanOptions(args, specs[name]);
    if (name === 'wc' && scan.valid && scan.options.has('--files0-from')) {
      const file = scan.options.get('--files0-from');
      set(0, file === '-' ? possible(0, 'wc reads file names from stdin for --files0-from=-.')
        : descriptorPath(file) ? unknownInput(name) : unused(0, 'wc reads file names from the specified file, not stdin.'));
    } else {
      set(0, fileInput(name, scan, { dashMeansStdin: name !== 'rev', maxFiles: name === 'base64' ? 1 : Infinity }));
    }
  } else if (name === 'ls') {
    recognise();
    set(0, unused(0, 'ls lists paths from arguments or the current directory; it does not read stdin.'));
    output('ls may write directory entries or help text to stdout.'); errors();
  } else if (name === 'xargs') {
    recognise(); output('xargs may write through the command it starts; the invoked command and input affect output.'); errors();
    set(2, usage('possible', 'may write', 'xargs and its invoked commands may write stderr, including prompts and diagnostics.'));
    const scan = scanOptions(args, { flags: '0oprtx', values: 'aEdILnPs', longFlags: ['--null', '--open-tty', '--no-run-if-empty', '--interactive', '--verbose', '--exit'],
      longValues: ['--arg-file', '--delimiter', '--eof', '--replace', '--max-lines', '--max-args', '--max-procs', '--max-chars'], stopAtOperand: true });
    if (scan.help) set(0, unused(0, 'xargs prints help or version information without reading stdin.'));
    else if (scan.valid) {
      const argFile = scan.options.get('-a') ?? scan.options.get('--arg-file');
      if (argFile === undefined) set(0, possible(0, 'xargs reads input items from stdin and uses them as command arguments.'));
      else if (argFile === '-' || descriptorPath(argFile)) set(0, unknownInput(name));
      else if (scan.options.has('-o') || scan.options.has('--open-tty')) set(0, unused(0, 'xargs reads item names from a file and opens the terminal for its child command.'));
      else {
        const child = scan.files.length ? inferUsage(scan.files) : inferUsage([{ value: 'echo', dynamic: false }]);
        set(0, child.fds[0].state === 'unused'
          ? unused(0, `xargs reads item names from a file; ${child.name} does not read the inherited stdin.`)
          : child.fds[0].state === 'possible'
            ? possible(0, `xargs reads item names from a file, but ${child.name} may read the inherited stdin.`)
            : unknownInput(name));
      }
    }
  } else if (name === '/usr/bin/time') {
    recognise(); errors();
    const scan = scanOptions(args, { flags: 'apvqV', values: 'fo', longFlags: ['--append', '--portability', '--verbose', '--quiet'],
      longValues: ['--format', '--output'], stopAtOperand: true });
    if (scan.help || (args.length === 1 && args[0].value === '-V')) {
      set(0, unused(0, 'time prints help or version information without reading stdin.'));
      output('time prints help or version information to stdout.');
    } else if (scan.valid && scan.files.length > 0) {
      const child = inferUsage(scan.files);
      for (const fd of [0, 1]) {
        const inferred = child.fds[fd];
        set(fd, usage(inferred.state, inferred.label, `/usr/bin/time runs ${child.name}. ${inferred.reason}`));
      }
      const outputFile = scan.options.get('-o') ?? scan.options.get('--output');
      if (outputFile && /^\/(?:dev\/(?:stdout|fd\/1)|proc\/self\/fd\/1)$/.test(outputFile)) {
        output('/usr/bin/time sends timing data to a path that refers to stdout; the child may also write stdout.');
      }
      set(2, usage('possible', outputFile === undefined ? 'timing + errors' : 'may write', '/usr/bin/time writes timing data to stderr by default; the child or time itself may also write diagnostics. With -o, timing data goes to a file.'));
    } else if (scan.valid && scan.files.length === 0) {
      set(0, unused(0, 'time has no command to run and does not read stdin.'));
      set(1, unused(1, 'time has no command to run; missing-command diagnostics go to stderr.'));
    }
  } else if (name === 'awk') {
    recognise(); output('awk may print from its program to stdout, depending on its input and rules.'); errors();
    let script = null, scriptFromFile = false, readsScriptInput = false, files = [], valid = literalArgs, i = 0;
    if (args.length === 1 && ['--help', '--version'].includes(args[0].value)) set(0, unused(0, 'awk prints help or version information without reading stdin.'));
    while (valid && i < args.length) {
      const arg = args[i].value;
      if (arg === '--') { i++; break; }
      if (arg === '-f' || arg === '-F' || arg === '-v') {
        if (!args[i + 1]) { valid = false; break; }
        if (arg === '-f') { scriptFromFile = true; readsScriptInput ||= args[i + 1].value === '-'; }
        i += 2; continue;
      }
      if (/^-[Fvf].+/.test(arg)) { if (arg[1] === 'f') { scriptFromFile = true; readsScriptInput ||= arg.slice(2) === '-'; } i++; continue; }
      if (arg.startsWith('-') && arg !== '-') { valid = false; break; }
      break;
    }
    if (valid) {
      if (!scriptFromFile) script = args[i++]?.value;
      files = args.slice(i);
      if (scriptFromFile || script !== undefined) {
        const fileArgs = files.filter(file => file.value !== '-' && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(file.value));
        if (readsScriptInput) set(0, possible(0, 'awk reads program source from stdin for -f -.'));
        else if (files.some(file => descriptorPath(file))) set(0, unknownInput(name));
        else if (!scriptFromFile && script && /^\s*BEGIN\s*\{[^{}]*\}\s*$/.test(script) && !/\b(?:getline|ARGV|system)\b|@/.test(script)) set(0, unused(0, 'This BEGIN-only awk program finishes without reading input records.'));
        else if (files.some(file => file.value === '-')) set(0, possible(0, 'awk reads stdin when “-” names an input file.'));
        else if (files.length === 0 || fileArgs.length === 0) set(0, possible(0, 'awk may read stdin when no input files are named. A BEGIN-only program may exit without reading.'));
        else if (!scriptFromFile && script && /^\s*(?:BEGIN\s*\{[^{}]*\}\s*)?\{[^{}]*\}\s*(?:END\s*\{[^{}]*\})?\s*$/.test(script) && !/\b(?:getline|ARGV|system)\b|@/.test(script)) {
          set(0, unused(0, 'This simple awk program processes the named files, not stdin.'));
        }
      }
    }
  } else if (name === 'sed') {
    recognise(); output('sed may print processed input to stdout; -n and -i can suppress normal output.'); errors();
    let sourceFromFile = false, readsScriptInput = false, inPlace = false, valid = literalArgs, i = 0;
    const scripts = [];
    if (args.length === 1 && ['--help', '--version'].includes(args[0].value)) set(0, unused(0, 'sed prints help or version information without reading stdin.'));
    while (valid && i < args.length) {
      const arg = args[i].value;
      if (arg === '--') { i++; break; }
      if (arg === '-e' || arg === '-f') {
        if (!args[i + 1]) { valid = false; break; }
        if (arg === '-f') { sourceFromFile = true; readsScriptInput ||= args[i + 1].value === '-'; }
        else scripts.push(args[i + 1].value);
        i += 2; continue;
      }
      if (/^-[ef].+/.test(arg)) { if (arg[1] === 'f') { sourceFromFile = true; readsScriptInput ||= arg.slice(2) === '-'; } else scripts.push(arg.slice(2)); i++; continue; }
      if (arg.startsWith('-i')) { inPlace = true; i++; continue; }
      if (/^-[nEruz]+$/.test(arg)) { i++; continue; }
      if (arg.startsWith('-') && arg !== '-') { valid = false; break; }
      break;
    }
    if (valid) {
      if (!sourceFromFile && scripts.length === 0 && args[i]) scripts.push(args[i++].value);
      const files = args.slice(i);
      if (sourceFromFile || scripts.length > 0) {
        const simpleScripts = !sourceFromFile && scripts.every(script => !/[;\n]/.test(script) && (/^s([^\w\s]).*\1.*\1[gIp0-9]*$/.test(script) || /^\d*[pdqQ]$/.test(script)));
        if (readsScriptInput) set(0, possible(0, 'sed reads program source from stdin for -f -.'));
        else if (files.some(file => descriptorPath(file))) set(0, unknownInput(name));
        else if (files.some(file => file.value === '-')) set(0, possible(0, 'sed reads stdin when “-” names an input file.'));
        else if (files.length === 0) set(0, possible(0, 'sed may read stdin when no input files are named.'));
        else if (simpleScripts) {
          set(0, unused(0, 'This simple sed script processes the named files, not stdin.'));
        }
        if (inPlace && simpleScripts) set(1, unused(1, 'sed -i sends normal output back to the input files. This simple script does not write stdout.'));
      }
    }
  } else if (name === 'true' || name === 'false') {
    recognise();
    set(0, unused(0, `${name} returns an exit status without reading stdin.`));
    if (!literalArgs || args.some(arg => arg.value === '--help' || arg.value === '--version')) {
      set(1, usage('unknown', 'usage unknown', `A shell builtin ${name} is silent, but an external ${name} may print help or version information.`));
      errors();
    } else {
      for (const fd of [1, 2]) set(fd, unused(fd, `${name} returns an exit status without writing standard streams.`));
    }
  }
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
