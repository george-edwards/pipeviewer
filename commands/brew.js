import { possible, unused, usage, lenientOptions } from './helpers.js';

// Homebrew, the package manager most Mac users add, which also runs on Linux. It asks no
// questions on stdin; a cask installer that needs a password asks through sudo, on the terminal.
const quiet = ['update', 'upgrade', 'install', 'reinstall', 'uninstall', 'remove', 'rm', 'list', 'ls', 'search', 'info', 'abv', 'outdated', 'cleanup', 'autoremove',
  'doctor', 'dr', 'config', 'tap', 'untap', 'link', 'ln', 'unlink', 'pin', 'unpin', 'leaves', 'deps', 'uses', 'desc', 'home', 'fetch', 'missing', 'shellenv', 'commands', 'help', 'services'];

export default {
  names: ['brew'],
  infer({ args, set, output, errors }) {
    errors();
    if (args.some(arg => arg.dynamic)) return;
    const { operands, has, options } = lenientOptions(args, { longValues: ['--file'] });
    const command = operands[0];
    output(`brew ${command ?? ''} reports what it does on stdout.`.replace('  ', ' '));
    if (!command) {
      if (options.length && !has('--version', '-v', '--help', '-h', '--prefix', '--cellar', '--repository', '--caskroom', '--cache', '--env', '--config')) return;
      set(0, unused(0, 'brew prints its usage or a setting without reading stdin.'));
      return;
    }
    if (command === 'sh' || command === 'irb') { set(0, possible(0, `brew ${command} starts an interactive shell, which reads stdin.`)); return; }
    if (command === 'bundle') {
      const file = options.find(([key]) => key === '--file')?.[1];
      set(0, file === '-' ? possible(0, 'brew bundle --file=- reads the Brewfile from stdin.') : unused(0, 'brew bundle reads its Brewfile, not stdin.'));
      return;
    }
    if (command === 'edit') { set(0, usage('unknown', 'usage unknown', 'brew edit opens an editor, which may read the terminal.')); return; }
    if (quiet.includes(command)) set(0, unused(0, `brew ${command} asks nothing, so it never reads stdin. A cask that needs a password asks through sudo, on the terminal.`));
  },
};
