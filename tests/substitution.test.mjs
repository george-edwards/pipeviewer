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
