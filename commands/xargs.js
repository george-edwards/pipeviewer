import { usage, unused, possible, unknownInput, descriptorPath, fillReplacements, scanOptions, bsd } from './helpers.js';

// macOS ships the BSD xargs: https://github.com/apple-oss-distributions/shell_cmds/blob/shell_cmds-326/xargs/xargs.c
const macos = bsd('+0E:I:J:L:n:oP:pR:S:s:rtx', [
  '--exit', '--interactive', '--max-args=', '--max-chars=', '--max-procs=', '--no-run-if-empty',
  '--null', '--verbose',
]);

export default {
  names: ['xargs'],
  infer({ name, args, set, output, errors, infer, platform, setJob }) {
    output('xargs may write through the command it starts; the invoked command and input affect output.'); errors();
    set(2, usage('possible', 'may write', 'xargs and its invoked commands may write stderr, including prompts and diagnostics.'));
    const scan = scanOptions(args, platform === 'macos' ? macos : { flags: '0oprtx', values: 'aEdILnPs', longFlags: ['--null', '--open-tty', '--no-run-if-empty', '--interactive', '--verbose', '--exit'],
      longValues: ['--arg-file', '--delimiter', '--eof', '--replace', '--max-lines', '--max-args', '--max-procs', '--max-chars'], stopAtOperand: true });
    if (scan.help) set(0, unused(0, 'xargs prints help or version information without reading stdin.'));
    else if (scan.valid) {
      const argFile = scan.options.get('-a') ?? scan.options.get('--arg-file');
      // A shell script run per item, as in xargs -P 8 sh -c '… "$1" …' _, is drawn like a parallel job.
      const [shell, flag, script, ...after] = scan.files;
      const shellName = shell?.value.replace(/^.*\//, '');
      if (/^(?:sh|bash|dash|ksh|zsh)$/.test(shellName ?? '') && !shell.dynamic && flag?.value === '-c' && script && !script.procsub && !fillReplacements(script).dynamic) {
        const tty = scan.options.has('-o') || scan.options.has('--open-tty');
        setJob({
          tool: 'xargs', shell: shellName === 'zsh' ? 'zsh' : 'bash', shellName,
          source: script.value, positions: script.positions ?? [], span: script.span, appended: false, ungroup: true,
          input: tty ? 'terminal' : argFile !== undefined ? 'inherit' : 'null',
          slots: scan.options.get('-P') ?? scan.options.get('--max-procs'),
          perJob: scan.options.get('-n') ?? scan.options.get('--max-args') ?? scan.options.get('-L') ?? scan.options.get('--max-lines') ?? (scan.options.has('-I') || scan.options.has('--replace') ? '1' : null),
          // The word after the script becomes $0; without one, the first item does.
          zeroth: after.length > 0,
        });
      }
      if (argFile === undefined) set(0, possible(0, 'xargs reads input items from stdin and uses them as command arguments.'));
      else if (argFile === '-' || descriptorPath(argFile)) set(0, unknownInput(name));
      else if (scan.options.has('-o') || scan.options.has('--open-tty')) set(0, unused(0, 'xargs reads item names from a file and opens the terminal for its child command.'));
      else {
        const child = scan.files.length ? infer(scan.files) : infer([{ value: 'echo', dynamic: false }]);
        set(0, child.fds[0].state === 'unused'
          ? unused(0, `xargs reads item names from a file; ${child.name} does not read the inherited stdin.`)
          : child.fds[0].state === 'possible'
            ? possible(0, `xargs reads item names from a file, but ${child.name} may read the inherited stdin.`)
            : unknownInput(name));
      }
    }
  },
};
