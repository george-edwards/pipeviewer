import { usage, unused, possible, unknownInput, descriptorPath, hasReplacement, fillReplacements, lenientOptions } from './helpers.js';

export default {
  names: ['parallel'],
  macos: false,
  instead: { macos: { '*': 'use xargs -P, or install GNU parallel with Homebrew' } },
  infer({ name, args, set, output, errors, infer, setJob }) {
    errors();
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
      setJob({ source: appended ? `${joined} {}` : joined, positions, span: words[0].span && [words[0].span[0], words.at(-1).span[1]], appended, ungroup: opts.has('-u', '--ungroup'),
        input: pipe || pipepart ? 'blocks' : opts.has('--tty') ? 'terminal' : argFiles.length && argFiles.every(file => file.value !== '-') ? 'inherit' : 'null',
        slots: opts.values('-j', '--jobs', '-P', '--max-procs').at(-1) });
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
      const child = words.length ? infer(words) : null;
      set(0, child?.fds[0].state === 'unused'
        ? unused(0, `parallel reads arguments from a file; ${child.name} does not read the stdin passed to the first job.`)
        : child?.fds[0].state === 'possible'
          ? possible(0, `parallel reads arguments from a file and passes stdin to the first job, which ${child.name} may read.`)
          : unknownInput(name));
    }
    if (opts.has('--bar', '--eta', '--progress')) set(2, usage('possible', 'progress + errors', 'parallel draws its progress display on stderr, and it and its jobs may write diagnostics.'));
  },
};
