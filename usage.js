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
const stdoutPath = file => /^\/(?:dev\/(?:stdout|fd\/1)|proc\/self\/fd\/1)$/.test(file);
// GNU parallel's replacement strings, such as {}, {.}, {/} and {2}. Parallel fills them in
// before a shell sees the command, so they are not brace expansions or globs.
const replacements = /\{(?:\d*(?:\.|\/|\/\/|\/\.)?|#|%)\}/g;
export const hasReplacement = text => text.search(replacements) !== -1;
export const fillReplacements = word => word.dynamic && !/[$*?[\]{}~]/.test(word.raw.replace(replacements, '')) ? { ...word, dynamic: false } : word;

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

// wc and sort can take NUL-separated file names from a file, or from stdin with “-”.
function namesFrom(name, file) {
  if (file === '-') return possible(0, `${name} reads file names from stdin for --files0-from=-.`);
  return descriptorPath(file) ? unknownInput(name) : unused(0, `${name} reads file names from the specified file, not stdin.`);
}

// For commands with too many options to list: unknown short letters and long options are
// treated as flags. Only use it where a misread operand cannot claim that a stream is unused.
// With stopAtOperand, the first operand and everything after it are returned as rest.
function lenientOptions(args, { shortValues = '', longValues = [], stopAtOperand = false }) {
  const options = [], operands = [];
  let rest = [];
  for (let i = 0; i < args.length; i++) {
    const value = args[i].value;
    if (value === '--') { rest = args.slice(i + 1); operands.push(...rest.map(arg => arg.value)); break; }
    if (stopAtOperand && (!value.startsWith('-') || value === '-')) { rest = args.slice(i); break; }
    if (value.startsWith('--')) {
      const [key, attached] = value.includes('=') ? [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)] : [value, null];
      options.push([key, longValues.includes(key) ? attached ?? args[++i]?.value : true]);
    } else if (value.startsWith('-') && value !== '-') {
      for (let j = 1; j < value.length; j++) {
        if (!shortValues.includes(value[j])) { options.push([`-${value[j]}`, true]); continue; }
        options.push([`-${value[j]}`, j + 1 < value.length ? value.slice(j + 1) : args[++i]?.value]);
        break;
      }
    } else operands.push(value);
  }
  const has = (...keys) => options.some(([key]) => keys.includes(key));
  const values = (...keys) => options.filter(([key]) => keys.includes(key)).map(([, value]) => value);
  return { options, operands, rest, has, values };
}

export function inferUsage(argv) {
  // Leading locale and timezone assignments, as in LC_ALL=C sort, change formatting but not which
  // program runs or the streams it uses. Others, such as PATH=…, stay unknown. Quoted words are not assignments.
  const command = argv.findIndex(arg => !/^(?:LC_[A-Z]+|LANG|LANGUAGE|TZ)=/.test(arg.raw ?? arg.value));
  if (command > 0) return inferUsage(argv.slice(command));
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
  } else if (['cat', 'zcat', 'wc', 'base64', 'basenc', 'cut', 'paste', 'rev', 'head', 'tail'].includes(name)) {
    recognise(); output(); errors();
    const specs = {
      cat: { flags: 'AbenstuvET', longFlags: ['--show-all', '--number-nonblank', '--show-ends', '--number', '--squeeze-blank', '--show-tabs', '--show-nonprinting'] },
      zcat: { flags: 'cdfklLnNqtv123456789', values: 'S', longFlags: ['--stdout', '--to-stdout', '--decompress', '--uncompress', '--force', '--keep', '--list', '--license',
        '--no-name', '--name', '--quiet', '--test', '--verbose', '--synchronous', '--rsyncable', '--fast', '--best'], longValues: ['--suffix'] },
      wc: { flags: 'clmwL', longFlags: ['--bytes', '--chars', '--lines', '--words', '--max-line-length'], longValues: ['--files0-from', '--total'] },
      base64: { flags: 'di', values: 'w', longFlags: ['--decode', '--ignore-garbage'], longValues: ['--wrap'] },
      basenc: { flags: 'di', values: 'w', longFlags: ['--decode', '--ignore-garbage', '--base64', '--base64url', '--base32', '--base32hex', '--base16', '--base2msbf', '--base2lsbf', '--z85'], longValues: ['--wrap'] },
      cut: { flags: 'Fnswz', values: 'bcfdO', longFlags: ['--only-delimited', '--zero-terminated', '--no-partial'], longValues: ['--bytes', '--characters', '--fields', '--delimiter', '--output-delimiter', '--whitespace-delimited'] },
      paste: { flags: 'sz', values: 'd', longFlags: ['--serial', '--zero-terminated'], longValues: ['--delimiters'] },
      rev: { flags: '0', longFlags: ['--zero'] },
      head: { flags: 'qvz', values: 'cn', longFlags: ['--quiet', '--silent', '--verbose', '--zero-terminated'], longValues: ['--bytes', '--lines'] },
      tail: { flags: 'fFqvz', values: 'cns', longFlags: ['--follow', '--retry', '--quiet', '--silent', '--verbose', '--zero-terminated'],
        longValues: ['--bytes', '--lines', '--follow', '--sleep-interval', '--pid', '--max-unchanged-stats'] },
    };
    // Obsolete counts: head -5, tail -5, and tail +5 when at most one file follows.
    const legacy = name === 'head' ? /^-\d+$/ : /^[-+]\d+[bcl]?f?$/;
    const counted = ['head', 'tail'].includes(name) && args.length <= 2 && !args[0]?.dynamic && legacy.test(args[0]?.value || '');
    const scan = scanOptions(counted ? args.slice(1) : args, specs[name]);
    if (name === 'wc' && scan.valid && scan.options.has('--files0-from')) {
      set(0, namesFrom(name, scan.options.get('--files0-from')));
    } else {
      set(0, fileInput(name, scan, { dashMeansStdin: name !== 'rev', maxFiles: ['base64', 'basenc'].includes(name) ? 1 : Infinity }));
    }
    if (name === 'zcat' && args.length === 1 && ['-h', '-V', '-L'].includes(args[0].value)) {
      set(0, unused(0, 'zcat prints help, version or licence information without reading stdin.'));
    } else if (name === 'zcat' && scan.valid && ['-t', '--test'].some(key => scan.options.has(key)) && !['-l', '--list'].some(key => scan.options.has(key))) {
      set(1, unused(1, 'zcat -t checks the compressed data and reports problems on stderr; it writes nothing to stdout.'));
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
      if (outputFile && stdoutPath(outputFile)) {
        output('/usr/bin/time sends timing data to a path that refers to stdout; the child may also write stdout.');
      }
      set(2, usage('possible', outputFile === undefined ? 'timing + errors' : 'may write', '/usr/bin/time writes timing data to stderr by default; the child or time itself may also write diagnostics. With -o, timing data goes to a file.'));
    } else if (scan.valid && scan.files.length === 0) {
      set(0, unused(0, 'time has no command to run and does not read stdin.'));
      set(1, unused(1, 'time has no command to run; missing-command diagnostics go to stderr.'));
    }
  } else if (['awk', 'mawk', 'gawk', 'nawk'].includes(name)) {
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
  } else if (['grep', 'egrep', 'fgrep'].includes(name)) {
    recognise(); output('grep may write matching lines, counts or file names to stdout.'); errors();
    const scan = scanOptions(args, { flags: 'EFGPiyvwxcLloqsbHhnTZzrRaUV', values: 'efmABCdD',
      longFlags: ['--extended-regexp', '--fixed-strings', '--basic-regexp', '--perl-regexp', '--ignore-case', '--no-ignore-case', '--invert-match', '--word-regexp',
        '--line-regexp', '--count', '--color', '--colour', '--files-without-match', '--files-with-matches', '--only-matching', '--quiet', '--silent', '--no-messages',
        '--byte-offset', '--with-filename', '--no-filename', '--line-number', '--initial-tab', '--null', '--null-data', '--text', '--recursive',
        '--dereference-recursive', '--line-buffered', '--binary'],
      longValues: ['--regexp', '--file', '--max-count', '--after-context', '--before-context', '--context', '--binary-files', '--devices', '--directories',
        '--exclude', '--exclude-from', '--exclude-dir', '--include', '--label', '--color', '--colour'] });
    const option = key => scan.options.get(key);
    const patternFile = option('-f') ?? option('--file');
    const patternOption = patternFile !== undefined || option('-e') !== undefined || option('--regexp') !== undefined;
    // Without -e or -f, the first operand is the pattern rather than a file.
    const files = patternOption ? scan.files : scan.files.slice(1);
    const recursive = ['-r', '-R', '--recursive', '--dereference-recursive'].some(key => scan.options.has(key)) || [option('-d'), option('--directories')].includes('recurse');
    if (scan.help || (args.length === 1 && args[0].value === '-V')) set(0, unused(0, 'grep prints help or version information without reading stdin.'));
    else if (scan.valid && (patternOption || scan.files.length > 0)) {
      if (patternFile === '-') set(0, possible(0, 'grep reads patterns from stdin for -f -.'));
      else if (patternFile !== undefined && descriptorPath(patternFile)) set(0, unknownInput(name));
      else if (recursive && files.length === 0) set(0, unused(0, 'grep -r searches the working directory when no files are named, not stdin.'));
      else set(0, fileInput(name, { ...scan, files }));
      if (['-q', '--quiet', '--silent'].some(key => scan.options.has(key))) set(1, unused(1, 'grep -q reports a match through its exit status and writes nothing to stdout.'));
    }
  } else if (name === 'sort') {
    recognise(); output('sort may write sorted lines to stdout once it has read all of its input.'); errors();
    const scan = scanOptions(args, { flags: 'bdfgiMhnRrsuVzcCm', values: 'kotST',
      longFlags: ['--ignore-leading-blanks', '--dictionary-order', '--ignore-case', '--general-numeric-sort', '--ignore-nonprinting', '--month-sort',
        '--human-numeric-sort', '--numeric-sort', '--random-sort', '--reverse', '--version-sort', '--check', '--debug', '--merge', '--stable', '--unique', '--zero-terminated'],
      longValues: ['--key', '--output', '--field-separator', '--buffer-size', '--temporary-directory', '--parallel', '--batch-size', '--compress-program',
        '--random-source', '--sort', '--files0-from', '--check'] });
    if (scan.valid && scan.options.has('--files0-from')) set(0, namesFrom(name, scan.options.get('--files0-from')));
    else set(0, fileInput(name, scan));
    if (scan.valid && !scan.help) {
      const outputFile = scan.options.get('-o') ?? scan.options.get('--output');
      if (['-c', '-C', '--check'].some(key => scan.options.has(key))) set(1, unused(1, 'sort in check mode reports disorder through stderr and its exit status; it writes nothing to stdout.'));
      else if (outputFile !== undefined && !stdoutPath(outputFile)) set(1, unused(1, 'sort -o writes the sorted result to the named file instead of stdout.'));
    }
  } else if (name === 'uniq') {
    recognise(); output('uniq may write the remaining or counted lines to stdout.'); errors();
    // --all-repeated and --group take an optional value, so they appear as flags and as values.
    const scan = scanOptions(args, { flags: 'cdDiuz', values: 'fsw',
      longFlags: ['--count', '--repeated', '--all-repeated', '--group', '--ignore-case', '--unique', '--zero-terminated'],
      longValues: ['--skip-fields', '--skip-chars', '--check-chars', '--all-repeated', '--group'] });
    // uniq takes at most an input file and an output file.
    const [input, outputFile] = scan.files;
    if (scan.help) set(0, fileInput(name, scan));
    else if (scan.valid && scan.files.length <= 2) {
      set(0, fileInput(name, { ...scan, files: input ? [input] : [] }));
      if (outputFile && !outputFile.dynamic && outputFile.value !== '-' && !stdoutPath(outputFile.value)) set(1, unused(1, 'uniq writes to the named output file instead of stdout.'));
    }
  } else if (name === 'curl') {
    recognise(); errors();
    output('curl writes the response body to stdout unless -o or -O saves it; -w and some trace options also write stdout.');
    if (literalArgs) {
      const opts = lenientOptions(args, { shortValues: 'AbcCdDeEFhHKmoPQrtTuUwxXyYz',
        longValues: ['--data', '--data-ascii', '--data-binary', '--data-raw', '--data-urlencode', '--json', '--form', '--form-string', '--upload-file', '--config',
          '--output', '--output-dir', '--write-out', '--dump-header', '--trace', '--trace-ascii', '--stderr', '--header', '--user-agent', '--request', '--url', '--user',
          '--proxy', '--max-time', '--connect-timeout', '--retry', '--cookie', '--cookie-jar', '--referer', '--range', '--cert', '--key', '--cacert', '--variable'] });
      // “-” and “@-” name stdin in data, form, upload and config values; for output options “-” is stdout.
      const writers = ['-o', '--output', '-D', '--dump-header', '--trace', '--trace-ascii', '--stderr', '-c', '--cookie-jar', '-w', '--write-out'];
      const inputs = opts.options.filter(([key, value]) => typeof value === 'string' && !writers.includes(key)).map(([, value]) => value);
      const uploads = opts.values('-T', '--upload-file');
      if (opts.has('-h', '--help', '-V', '--version')) set(0, unused(0, 'curl prints help or version information without reading stdin.'));
      else if (inputs.some(value => /(?:^|[@<])-$/.test(value)) || uploads.includes('.')) set(0, possible(0, 'curl reads upload data, form fields or its config from stdin when a value names “-”.'));
      else if (inputs.some(value => /(?:^|[@<])\/(?:dev|proc)\//.test(value)) || opts.has('-K', '--config')) set(0, unknownInput(name));
      else set(0, unused(0, 'curl sends data from its arguments and named files; these arguments do not read stdin.'));
      const urls = opts.operands.filter(value => value.includes('://')).length + opts.values('--url').length;
      const saved = opts.values('-o', '--output').filter(file => file !== '-' && !stdoutPath(file)).length + (opts.has('-O', '--remote-name', '--remote-name-all') ? urls : 0);
      const toStdout = opts.has('-w', '--write-out') || opts.values('-o', '--output', '-D', '--dump-header', '--trace', '--trace-ascii', '--stderr').includes('-');
      if (urls > 0 && saved >= urls && !toStdout && !opts.has('-h', '--help', '-V', '--version')) set(1, unused(1, 'curl saves every response to a file and nothing else is sent to stdout.'));
      if (!opts.has('-s', '--silent')) set(2, usage('possible', 'progress + errors', 'curl shows a progress meter on stderr when its output is not a terminal, and may write diagnostics.'));
    }
  } else if (name === 'wget') {
    recognise(); errors();
    set(0, unknownInput(name));
    output('wget may write to stdout for -O - or for help and version information.');
    if (literalArgs) {
      const opts = lenientOptions(args, { shortValues: 'oaiBtOTwQPUelARDIXY',
        longValues: ['--output-document', '--input-file', '--output-file', '--append-output', '--user-agent', '--tries', '--timeout', '--wait', '--directory-prefix',
          '--execute', '--level', '--accept', '--reject', '--domains', '--header', '--post-data', '--post-file', '--body-data', '--body-file', '--method', '--user',
          '--password', '--load-cookies', '--save-cookies', '--base', '--config', '--limit-rate', '--quota', '--referer'] });
      const help = opts.has('-h', '--help', '-V', '--version');
      const inputs = opts.values('-i', '--input-file', '--post-file', '--body-file');
      if (help) set(0, unused(0, 'wget prints help or version information without reading stdin.'));
      else if (inputs.includes('-')) set(0, possible(0, 'wget reads URLs or request data from stdin when -i or a body file is “-”.'));
      else if (inputs.every(file => !descriptorPath(file))) set(0, unused(0, 'wget downloads the URLs in its arguments or input file; it does not read stdin.'));
      if (!help && !opts.values('-O', '--output-document', '-o', '--output-file', '-a', '--append-output').some(file => file === '-' || stdoutPath(file))) {
        set(1, unused(1, 'wget saves downloads to files and logs to stderr; it writes nothing to stdout.'));
      }
      const logFile = opts.values('-o', '--output-file', '-a', '--append-output').length > 0;
      if (!opts.has('-q', '--quiet') && !logFile) set(2, usage('possible', 'log + errors', 'wget logs its progress to stderr unless -q or -o is given, and may write diagnostics.'));
    }
  } else if (name === 'pv') {
    recognise(); errors();
    output('pv copies its input to stdout unchanged.');
    set(2, usage('possible', 'progress + errors', 'pv draws its progress display on stderr when stderr is a terminal, or always with -f or -n, and may write diagnostics.'));
    // A strict scan: an unlisted option could take a value that would otherwise look like a file.
    const scan = scanOptions(args, { flags: 'ptIeTrab8nqcWlf0CESYKXhV', values: 'AFDsimwHNLBZdRPoUx',
      longFlags: ['--progress', '--timer', '--eta', '--fineta', '--rate', '--average-rate', '--bytes', '--bits', '--buffer-percent', '--numeric', '--quiet',
        '--cursor', '--wait', '--line-mode', '--null', '--force', '--no-splice', '--skip-errors', '--stop-at-size', '--sync', '--direct-io', '--discard'],
      longValues: ['--last-written', '--format', '--delay-start', '--size', '--interval', '--average-rate-window', '--width', '--height', '--name', '--rate-limit',
        '--buffer-size', '--error-skip-block', '--watchfd', '--remote', '--pidfile', '--output', '--store-and-forward', '--extra-display'] });
    const has = (...keys) => keys.some(key => scan.options.has(key));
    const outputFile = scan.options.get('-o') ?? scan.options.get('--output');
    if (scan.help || (scan.valid && args.length === 1 && has('-h', '-V'))) set(0, unused(0, 'pv prints help or version information without reading stdin.'));
    else if (scan.valid && has('-d', '--watchfd')) {
      set(0, unused(0, 'pv -d watches another process’s file descriptors; it does not read stdin.'));
      set(1, unused(1, 'pv -d only reports on another process; it copies no data to stdout.'));
    } else if (scan.valid && has('-R', '--remote')) {
      set(0, unused(0, 'pv -R changes the settings of another running pv; it does not read stdin.'));
      set(1, unused(1, 'pv -R sends new settings to another pv and copies no data.'));
      set(2, possible(2, 'pv -R shows no progress itself; errors go to stderr.'));
    } else {
      set(0, fileInput(name, scan));
      if (scan.valid && has('-X', '--discard')) set(1, unused(1, 'pv -X reads and measures its input, then discards it instead of writing stdout.'));
      else if (scan.valid && outputFile !== undefined && outputFile !== '-' && !stdoutPath(outputFile)) set(1, unused(1, 'pv -o writes the data to the named file instead of stdout.'));
      if (scan.valid && has('-q', '--quiet')) set(2, possible(2, 'pv -q shows no progress display; only diagnostics go to stderr.'));
    }
  } else if (name === 'parallel') {
    recognise(); errors();
    output('parallel passes each job’s stdout through to its own, one whole job at a time unless -u is given. --dry-run prints the commands instead.');
    set(2, usage('possible', 'may write', 'parallel and its jobs may write stderr, including diagnostics and, in interactive use, a citation notice.'));
    const opts = lenientOptions(args, { shortValues: 'aCdEIjLnNPsSW', stopAtOperand: true,
      longValues: ['--arg-file', '--jobs', '--max-procs', '--joblog', '--results', '--res', '--block', '--block-size', '--colsep', '--delimiter', '--replace',
        '--max-args', '--max-lines', '--max-replace-args', '--sshlogin', '--sshloginfile', '--slf', '--workdir', '--wd', '--tmpdir', '--timeout', '--tagstring',
        '--load', '--memfree', '--delay', '--retries', '--env', '--basefile', '--transferfile', '--return', '--header', '--arg-sep', '--arg-file-sep',
        '--recstart', '--recend', '--halt', '--nice', '--eof', '--termseq'] });
    // Arguments follow :::, or name argument files after ::::. The + forms link sources instead of combining them.
    const separator = token => !token.dynamic && /^::::?\+?$/.test(token.value);
    const cut = opts.rest.findIndex(separator);
    const command = cut === -1 ? opts.rest : opts.rest.slice(0, cut);
    const argFiles = opts.values('-a', '--arg-file').map(value => ({ value, dynamic: value === undefined }));
    let sources = 0, fromFiles = false;
    for (const token of cut === -1 ? [] : opts.rest.slice(cut)) {
      if (separator(token)) { sources++; fromFiles = token.value.startsWith('::::'); } else if (fromFiles) argFiles.push(token);
    }
    const optionsLiteral = args.slice(0, args.length - opts.rest.length).every(arg => !arg.dynamic);
    const pipe = opts.has('--pipe', '--spreadstdin'), pipepart = opts.has('--pipepart');
    // Parallel runs its command through a shell for each job, so the parser can draw it as a pipeline.
    const words = command.map(fillReplacements);
    if (optionsLiteral && words.length && words.every(word => !word.dynamic && !word.procsub) && !opts.has('--arg-sep', '--arg-file-sep', '--dry-run')) {
      const joined = words.map(word => word.value).join(' ');
      // Without a replacement string, parallel appends the arguments to the command.
      const appended = !pipe && !pipepart && !hasReplacement(joined);
      // Where each character of the job's command was typed; a space or the appended {} borrows its neighbour's.
      const positions = words.flatMap((word, k) => [...(k ? [word.span?.[0] ?? 0] : []), ...(word.positions ?? [])]);
      if (appended) positions.push(...Array(3).fill((words.at(-1).span?.[1] ?? 1) - 1));
      result.job = { source: appended ? `${joined} {}` : joined, positions, span: words[0].span && [words[0].span[0], words.at(-1).span[1]], appended, ungroup: opts.has('-u', '--ungroup'),
        input: pipe || pipepart ? 'blocks' : opts.has('--tty') ? 'terminal' : argFiles.length && argFiles.every(file => file.value !== '-') ? 'inherit' : 'null',
        slots: opts.values('-j', '--jobs', '-P', '--max-procs').at(-1) };
    }
    if (args.length === 1 && ['-h', '--help', '-V', '--version'].includes(args[0].value)) set(0, unused(0, 'parallel prints help or version information without reading stdin.'));
    else if (!optionsLiteral || opts.has('--arg-sep', '--arg-file-sep', '--tty')) set(0, unknownInput(name));
    else if (argFiles.some(file => file.dynamic || descriptorPath(file))) set(0, unknownInput(name));
    else if (argFiles.some(file => file.value === '-')) set(0, possible(0, pipe ? 'parallel --pipe splits stdin into blocks for its jobs when the input file is “-”.' : 'parallel reads arguments from stdin for :::: - or -a -.'));
    else if (pipe || pipepart) {
      if (argFiles.length > 0) set(0, unused(0, 'parallel splits the named file into blocks for its jobs, not stdin.'));
      else if (!pipepart) set(0, possible(0, 'parallel --pipe splits stdin into blocks and feeds each block to a job’s stdin.'));
    } else if (sources === 0 && argFiles.length === 0) set(0, possible(0, 'parallel reads arguments from stdin, one per line, when no ::: or :::: input source is given.'));
    else if (argFiles.length === 0) set(0, unused(0, 'parallel takes its arguments from :::, and each job’s stdin comes from /dev/null.'));
    else {
      // The manual passes stdin to the first job when arguments come from a file.
      const child = words.length ? inferUsage(words) : null;
      set(0, child?.fds[0].state === 'unused'
        ? unused(0, `parallel reads arguments from a file; ${child.name} does not read the stdin passed to the first job.`)
        : child?.fds[0].state === 'possible'
          ? possible(0, `parallel reads arguments from a file and passes stdin to the first job, which ${child.name} may read.`)
          : unknownInput(name));
    }
    if (opts.has('--bar', '--eta', '--progress')) set(2, usage('possible', 'progress + errors', 'parallel draws its progress display on stderr, and it and its jobs may write diagnostics.'));
  } else if (name === 'find') {
    recognise(); errors();
    output('find may print matching paths to stdout.');
    // Bash leaves a bare {} alone; find replaces it with each path.
    const words = args.map(arg => arg.raw === '{}' ? { ...arg, dynamic: false } : arg);
    const values = words.map(arg => arg.value);
    if (args.length === 1 && ['--help', '--version'].includes(values[0])) set(0, unused(0, 'find prints help or version information without reading stdin.'));
    else if (words.every(arg => !arg.dynamic)) {
      // Commands from -exec and -ok inherit find's stdin and stdout.
      const children = [];
      let prints = false, actions = false, prompts = false, namesFromStdin = false;
      for (let i = 0; i < args.length; i++) {
        const value = values[i];
        if (['-exec', '-execdir', '-ok', '-okdir'].includes(value)) {
          const end = values.findIndex((token, j) => j > i && [';', '+'].includes(token));
          children.push(inferUsage(words.slice(i + 1, end === -1 ? words.length : end)));
          prompts ||= value.startsWith('-ok');
          actions = true; i = end === -1 ? args.length : end;
        } else if (['-print', '-print0', '-printf', '-ls'].includes(value)) prints = actions = true;
        else if (['-fprint', '-fprint0', '-fprintf', '-fls'].includes(value)) { actions = true; prints ||= stdoutPath(values[i + 1]); }
        else if (['-delete', '-quit'].includes(value)) actions = true;
        else if (value === '-files0-from') namesFromStdin ||= values[i + 1] === '-';
      }
      const states = fd => children.map(child => child.fds[fd].state);
      if (prompts || namesFromStdin || states(0).includes('possible')) set(0, possible(0, prompts ? 'find -ok reads each confirmation from stdin.' : namesFromStdin ? 'find reads starting points from stdin for -files0-from -.' : 'A command run by find -exec may read the inherited stdin.'));
      else if (states(0).every(state => state === 'unused')) set(0, unused(0, children.length ? 'find walks the named paths, and the commands it runs do not read stdin.' : 'find walks the named paths; it does not read stdin.'));
      // Without an action, find prints each match.
      if (actions && !prints && states(1).every(state => state === 'unused')) set(1, unused(1, 'This find expression acts on matches without printing them; it writes nothing to stdout.'));
      else if (actions && !prints && states(1).includes('unknown')) set(1, usage('unknown', 'usage unknown', 'find prints nothing itself, but a command it runs may write stdout.'));
      if (prompts) set(2, usage('possible', 'may write', 'find -ok writes each confirmation prompt to stderr.'));
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
