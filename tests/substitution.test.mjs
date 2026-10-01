import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline, destinationLabel } from '../parser.js';
import { pipeActivity, portUsage } from '../usage.js';

test('>(…) receives the redirected descriptor and inherits the pipe to the next command', () => {
  const model = parsePipeline('echo "hello, world" 2> >(cat) | xargs echo got');
  const [echo, xargs] = model.commands;
  const [sub] = model.substitutions;
  const [cat] = sub.commands;
  assert.equal(echo.command, 'echo "hello, world"');
  assert.equal(echo.fds[2], sub.endpoint);
  assert.equal(echo.fds[63], sub.endpoint);
  assert.equal(cat.fds[0], sub.endpoint);
  assert.equal(cat.fds[1], xargs.fds[0]);
  assert.equal(cat.fds[2].id, 'terminal-err');
  assert.equal(cat.key, '1a');
  assert.deepEqual(model.pipes[0].writers, [echo, cat]);
  assert.equal(destinationLabel(cat.fds[0], 0, model.commands, cat), 'Substitution input from echo "hello, world"');
  assert.equal(destinationLabel(echo.fds[2], 2, model.commands, echo), '>(cat) · /dev/fd/63');
});

test('substitutions snapshot descriptors at their place in the redirect order', () => {
  const before = parsePipeline('ls x > out 2> >(cat)').substitutions[0].commands[0];
  assert.equal(before.fds[1].label, 'out');
  const after = parsePipeline('ls x 2> >(cat) > out').substitutions[0].commands[0];
  assert.equal(after.fds[1].id, 'terminal-out');
  // A later substitution inherits stderr that already points at an earlier one.
  const model = parsePipeline('cmd 2> >(a) > >(b)');
  assert.equal(model.substitutions[1].commands[0].fds[2], model.substitutions[0].endpoint);
});

test('<(…) arguments become /dev/fd paths that do not alias stdin', () => {
  const model = parsePipeline('paste <(cut -f 1 a.tsv) <(cut -f 3 b.tsv)');
  const [paste] = model.commands;
  assert.deepEqual(model.substitutions.map(sub => sub.fd), [63, 62]);
  assert.equal(paste.fds[63], model.substitutions[0].endpoint);
  assert.equal(paste.fds[1].id, 'terminal-out');
  assert.equal(portUsage(paste, 0).state, 'unused');
  assert.equal(portUsage(paste, 63).label, 'may read');
  assert.equal(model.substitutions[1].commands[0].fds[1], model.substitutions[1].endpoint);
  assert.equal(model.substitutions[0].commands[0].fds[0].id, 'terminal-in');
  assert.equal(portUsage(parsePipeline('cat /dev/fd/3').commands[0], 0).state, 'unknown');
});

test('< <(…) reads stdin from a substitution, and substitutions can hold pipelines', () => {
  const read = parsePipeline('cat < <(ls)');
  assert.equal(read.commands[0].fds[0], read.substitutions[0].endpoint);
  const model = parsePipeline('ls 2> >(sed s/^/e:/ | tee log) | wc -l');
  const [sed, tee] = model.substitutions[0].commands;
  assert.deepEqual([sed.key, tee.key], ['1a.1', '1a.2']);
  assert.equal(sed.fds[1], tee.fds[0]);
  assert.equal(tee.fds[1], model.pipes[0]);
  assert.deepEqual(model.notes, []);
});

test('a substitution keeps a pipe writer alive after its owner redirects away', () => {
  const model = parsePipeline('sleep 1 > >(cat) | wc -l');
  assert.deepEqual(model.notes, []);
  assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, false);
  assert.match(parsePipeline('sleep 1 > out | wc -l').notes[0], /no writer/);
});

test('quoted substitution syntax stays literal', () => {
  const cmd = parsePipeline('echo ">(cat)" \'<(ls)\'').commands[0];
  assert.equal(cmd.command, 'echo ">(cat)" \'<(ls)\'');
  assert.equal(cmd.substitutions.length, 0);
});

test('malformed process substitutions produce actionable errors', () => {
  const cases = {
    'echo 2>(cat)': /2> >\(/,
    'echo a<(ls)': /space before/,
    'echo >(cat)x': /space after/,
    'echo >()': /inside/,
    'echo >(cat': /Close the process substitution/,
    'cat < >(x)': /< <\(command\)/,
    'echo > <(x)': />\(command\)/,
    'echo 2>& >(x)': /descriptor number/,
    '<(ls)': /command itself/,
    'echo >(cat $(pwd))': /Command substitutions/,
  };
  for (const [source, message] of Object.entries(cases)) assert.throws(() => parsePipeline(source), message, source);
});

test('substitutions redirected to extra descriptors keep that descriptor number', () => {
  const model = parsePipeline('paste /dev/fd/3 /dev/fd/4 3< <(cat words) 4< <(rev words)');
  const [paste] = model.commands;
  const [cat, rev] = model.substitutions;
  assert.deepEqual([cat.place, rev.place], [3, 4]);
  assert.equal(paste.fds[3], cat.endpoint);
  assert.equal(paste.fds[4], rev.endpoint);
  assert.equal(portUsage(paste, 3).label, 'may read');
  assert.equal(portUsage(paste, 4).label, 'may read');
  // The named paths are the substitutions, so paste does not read stdin.
  assert.equal(portUsage(paste, 0).state, 'unused');
  // Without a matching path argument, fd 3 usage stays unknown.
  assert.equal(portUsage(parsePipeline('paste a 3< <(cat words)').commands[0], 3).state, 'unknown');
});

test('a parallel job command becomes a template whose output parallel collects', () => {
  const model = parsePipeline(`parallel "zcat {} | grep -E '^en ' | awk '{t+=\\$3} END {print t}'" ::: a.gz b.gz | awk '{n+=$1} END {print n}'`);
  const [parallel, sum] = model.commands;
  const [job] = model.substitutions;
  const [zcat, grep, awk] = job.commands;
  assert.equal(job.kind, 'job');
  assert.equal(job.text, "zcat {} | grep -E '^en ' | awk '{t+=$3} END {print t}'");
  assert.equal(zcat.fds[0].type, 'null');
  assert.equal(zcat.usage.fds[0].state, 'unused', '{} is filled in by parallel, not globbed');
  assert.equal(zcat.fds[1], grep.fds[0]);
  assert.equal(awk.fds[1].type, 'job');
  for (const cmd of job.commands) assert.equal(cmd.fds[2], awk.fds[1]);
  assert.deepEqual(model.pipes[0].writers, [parallel], 'grouped jobs never write to the pipe themselves');
  assert.equal(sum.fds[0], parallel.fds[1]);
  assert.equal(destinationLabel(awk.fds[1], 1, model.commands, awk), 'parallel · collected, then written to its stdout');
});

test('parallel -u jobs write to parallel’s stdout, and --pipe feeds them blocks', () => {
  const ungrouped = parsePipeline('parallel -u "zcat {} | wc -l" ::: a b | sort');
  const job = ungrouped.substitutions[0];
  assert.equal(job.commands[1].fds[1], ungrouped.pipes[0]);
  assert.equal(job.commands[1].fds[2].id, 'terminal-err');
  assert.deepEqual(ungrouped.pipes[0].writers, [ungrouped.commands[0], job.commands[1]]);
  const piped = parsePipeline('zcat big.gz | parallel --pipe --block 50M wc -l').substitutions[0];
  assert.equal(piped.text, 'wc -l', '--pipe does not append arguments');
  assert.deepEqual([piped.commands[0].fds[0].type, piped.commands[0].fds[0].direction], ['job', '>']);
  assert.equal(parsePipeline('parallel --tty vi ::: a').substitutions[0].commands[0].fds[0].id, 'terminal-in');
  assert.equal(parsePipeline('parallel -a list cat').substitutions[0].commands[0].fds[0].id, 'terminal-in', 'the first job gets stdin');
  assert.equal(parsePipeline('parallel -a - cat').substitutions[0].commands[0].fds[0].type, 'null');
});

test('parallel appends {} without a replacement string, and unreadable jobs stay arguments', () => {
  assert.equal(parsePipeline('parallel gzip -9 ::: a b').substitutions[0].text, 'gzip -9 {}');
  assert.equal(parsePipeline('parallel "zcat {} > {.}.txt" ::: a.gz').substitutions[0].commands[0].fds[1].label, '{.}.txt');
  for (const source of ['parallel --dry-run gzip ::: a', 'parallel ::: "echo a" "echo b"', 'parallel "$CMD" ::: a']) {
    assert.equal(parsePipeline(source).substitutions.length, 0, source);
  }
  const model = parsePipeline('parallel "make {} && echo done" ::: a b');
  assert.equal(model.substitutions.length, 0);
  assert.equal(model.endpoints.some(dest => dest.id.startsWith('job-')), false, 'a failed job leaves no endpoints behind');
  assert.match(model.notes[0], /^The parallel job command is shown as an argument\. Use one pipeline inside a parallel job/);
});

test('egrep and fgrep are modelled like grep', () => {
  for (const name of ['egrep', 'fgrep']) {
    assert.equal(parsePipeline(`${name} x`).commands[0].usage.fds[0].state, 'possible');
    assert.equal(parsePipeline(`${name} x file`).commands[0].usage.fds[0].state, 'unused');
  }
});

test('xargs running sh -c draws the script as a job template, like parallel', () => {
  const model = parsePipeline(`printf '%s\\0' *.gz | xargs -0 -n 1 -P 8 sh -c 'gzcat "$1" | wc -l 1> "$1.count"' _`);
  const job = model.substitutions.find(sub => sub.kind === 'job');
  assert.equal(job.tool, 'xargs');
  assert.deepEqual(job.commands.map(cmd => cmd.usage.name), ['gzcat', 'wc']);
  // Jobs read /dev/null, $1 acts as a placeholder, and output is not collected.
  assert.equal(job.commands[0].fds[0].label, '/dev/null');
  assert.equal(job.commands[1].fds[1].label, '$1.count');
  assert.equal(job.commands[0].fds[2], model.commands[1].fds[2]);
  assert.equal(job.zeroth, true);
  assert.equal(parsePipeline("xargs sh -c 'echo $0'").substitutions[0].zeroth, false);
  // sh -c follows Bash's rules even under zsh, so no MULTIOS fan-out inside the job.
  const mac = parsePipeline("xargs sh -c 'echo hi > a > b'", { platform: 'macos' });
  assert.equal(mac.substitutions[0].commands[0].fds[1].label, 'b');
  assert.equal(parsePipeline("xargs zsh -c 'echo hi > a > b'", { platform: 'macos' }).substitutions[0].commands[0].fds[1].type, 'multio');
  // xargs -o gives each job the terminal.
  assert.equal(parsePipeline("xargs -o sh -c 'vi \"$1\"' _").substitutions[0].commands[0].fds[0].id, 'terminal-in');
});
