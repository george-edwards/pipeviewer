import { unused, possible, unknownInput, descriptorPath } from './helpers.js';

// macOS ships the BSD sed, parsed by hand below like GNU sed: https://github.com/apple-oss-distributions/text_cmds/blob/text_cmds-195/sed/main.c
export default {
  names: ['sed'],
  infer({ name, args, literalArgs, set, output, errors, platform, note }) {
    output('sed may print processed input to stdout; -n and -i can suppress normal output.'); errors();
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
      // BSD sed's -i and -I take a backup suffix, so sed -i s/a/b/ f treats s/a/b/ as the suffix.
      if (platform === 'macos' && (arg === '-i' || arg === '-I')) {
        if (!args[i + 1]) { valid = false; break; }
        inPlace = true; i += 2; continue;
      }
      if (platform === 'macos' ? /^-[iI]./.test(arg) : arg.startsWith('-i')) { inPlace = true; i++; continue; }
      if ((platform === 'macos' ? /^-[nEraluH]+$/ : /^-[nEruz]+$/).test(arg)) { i++; continue; }
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
        else if (platform !== 'macos' && files.some(file => file.value === '-')) set(0, possible(0, 'sed reads stdin when “-” names an input file.'));
        else if (files.length === 0) set(0, possible(0, 'sed may read stdin when no input files are named.'));
        else if (simpleScripts) {
          set(0, unused(0, 'This simple sed script processes the named files, not stdin.'));
        }
        if (platform === 'macos' && inPlace && args.some(arg => arg.value === '-i') && args[args.findIndex(arg => arg.value === '-i') + 1]?.value !== '') {
          note('BSD sed takes the word after -i as a backup suffix: write sed -i \'\' … to edit in place without a backup.');
        }
        if (inPlace && simpleScripts) set(1, unused(1, 'sed -i sends normal output back to the input files. This simple script does not write stdout.'));
      }
    }
  },
};
