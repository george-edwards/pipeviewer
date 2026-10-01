// Shared building blocks for the command rules in this folder, and for usage.js.
export const usage = (state, label, reason) => ({ state, label, reason });
export const unused = (fd, reason) => usage('unused', fd === 0 ? 'not read' : 'never written', reason);
export const possible = (fd, reason) => usage('possible', fd === 0 ? 'may read' : fd === 2 ? 'on error' : 'may write', reason);
export const unknownInput = name => usage('unknown', 'usage unknown', `${name}: these arguments do not establish whether stdin is read.`);
const descriptorPattern = /^\/(?:dev\/(?:stdin|fd\/\d+)|proc\/self\/fd\/\d+)$/;
// A /dev/fd path from a process substitution names that substitution's pipe, never stdin.
export const descriptorPath = file => typeof file === 'string' ? descriptorPattern.test(file) : !file.procsub && descriptorPattern.test(file.value);
export const stdoutPath = file => /^\/(?:dev\/(?:stdout|fd\/1)|proc\/self\/fd\/1)$/.test(file);
// GNU parallel's replacement strings, such as {}, {.}, {/} and {2}. Parallel fills them in
// before a shell sees the command, so they are not brace expansions or globs.
const replacements = /\{(?:\d*(?:\.|\/|\/\/|\/\.)?|#|%)\}/g;
export const hasReplacement = text => text.search(replacements) !== -1;
export const fillReplacements = word => word.dynamic && !/[$*?[\]{}~]/.test(word.raw.replace(replacements, '')) ? { ...word, dynamic: false } : word;

// A small option scanner. It consumes known option values so they are not mistaken for files.
export function scanOptions(args, { flags = '', values = '', longFlags = [], longValues = [], stopAtOperand = false } = {}) {
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

export function fileInput(name, scan, { dashMeansStdin = true, maxFiles = Infinity } = {}) {
  if (scan.help) return unused(0, `${name} prints help or version information without reading stdin.`);
  if (!scan.valid || scan.files.length > maxFiles || scan.files.some(file => file.dynamic)) return unknownInput(name);
  if (scan.files.some(file => descriptorPath(file))) return unknownInput(name);
  if (scan.files.length === 0 || (dashMeansStdin && scan.files.some(file => file.value === '-')))
    return possible(0, `${name} may read stdin when no input files are given${dashMeansStdin ? ' or when “-” names stdin' : ''}.`);
  return unused(0, `${name} reads the named file${scan.files.length === 1 ? '' : 's'} instead of stdin.`);
}

// wc and sort can take NUL-separated file names from a file, or from stdin with “-”.
export function namesFrom(name, file) {
  if (file === '-') return possible(0, `${name} reads file names from stdin for --files0-from=-.`);
  return descriptorPath(file) ? unknownInput(name) : unused(0, `${name} reads file names from the specified file, not stdin.`);
}

// For commands with too many options to list: unknown short letters and long options are
// treated as flags. Only use it where a misread operand cannot claim that a stream is unused.
// With stopAtOperand, the first operand and everything after it are returned as rest.
export function lenientOptions(args, { shortValues = '', longValues = [], stopAtOperand = false }) {
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

// A filter reads its named files, or stdin when none are named, and writes its result to stdout.
// skip leaves leading arguments, such as head's obsolete -5, out of the option scan.
export function filterInput({ name, args, set, output, errors }, spec, { skip = 0, dashMeansStdin = true, maxFiles = Infinity } = {}) {
  output(); errors();
  const scan = scanOptions(args.slice(skip), spec);
  set(0, fileInput(name, scan, { dashMeansStdin, maxFiles }));
  return scan;
}
