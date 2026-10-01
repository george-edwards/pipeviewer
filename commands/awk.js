import { unused, possible, unknownInput, descriptorPath } from './helpers.js';

export default {
  names: ['awk', 'mawk', 'gawk', 'nawk'],
  infer({ name, args, literalArgs, set, output, errors }) {
    output('awk may print from its program to stdout, depending on its input and rules.'); errors();
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
  },
};
