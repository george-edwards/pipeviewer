import { usage, unused, possible, stdoutPath } from './helpers.js';

export default {
  names: ['find'],
  infer({ args, set, output, errors, infer, platform }) {
    errors();
    output('find may print matching paths to stdout.');
    // Bash leaves a bare {} alone; find replaces it with each path.
    const words = args.map(arg => arg.raw === '{}' ? { ...arg, dynamic: false } : arg);
    const values = words.map(arg => arg.value);
    if (platform === 'macos') {
      // BSD find needs a starting path, given first or with -f, and has no -printf or -fprint actions.
      const start = values.findIndex(value => !/^-[EHLPXdsx]+$/.test(value));
      const path = values.includes('-f') || (start !== -1 && !values[start].startsWith('-') && !['!', '('].includes(values[start]));
      if (!path || values.some(value => /^-f(?:print0?|printf|ls)$|^-printf$/.test(value))) return;
    }
    if (args.length === 1 && ['--help', '--version'].includes(values[0])) set(0, unused(0, 'find prints help or version information without reading stdin.'));
    else if (words.every(arg => !arg.dynamic)) {
      // Commands from -exec and -ok inherit find's stdin and stdout.
      const children = [];
      let prints = false, actions = false, prompts = false, namesFromStdin = false;
      for (let i = 0; i < args.length; i++) {
        const value = values[i];
        if (['-exec', '-execdir', '-ok', '-okdir'].includes(value)) {
          const end = values.findIndex((token, j) => j > i && [';', '+'].includes(token));
          children.push(infer(words.slice(i + 1, end === -1 ? words.length : end)));
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
  },
};
