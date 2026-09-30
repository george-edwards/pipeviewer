import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline } from '../parser.js';
import { pipeActivity, portUsage } from '../usage.js';

test('sleep to echo remains connected but neither end uses the pipe', () => {
  const model = parsePipeline('sleep 2 | echo "hello, world"');
  const [sleep, echo] = model.commands;
  assert.equal(sleep.fds[1], echo.fds[0]);
  assert.equal(sleep.usage.fds[0].state, 'unused');
  assert.equal(sleep.usage.fds[1].state, 'unused');
  assert.equal(echo.usage.fds[0].state, 'unused');
  assert.equal(echo.usage.fds[1].state, 'possible');
  const activity = pipeActivity(model.commands, model.pipes[0]);
  assert.equal(activity.noWrites, true);
  assert.equal(activity.notRead, true);
  assert.equal(activity.label, 'pipe · no writes');
});

test('cat can read and wait for EOF even if its producer writes nothing', () => {
  const model = parsePipeline('sleep .2 | cat');
  assert.equal(portUsage(model.commands[1], 0).state, 'possible');
  const activity = pipeActivity(model.commands, model.pipes[0]);
  assert.equal(activity.noWrites, true);
  assert.equal(activity.notRead, false);
});

test('ignored input never implies the producer writes zero bytes', () => {
  const model = parsePipeline('echo data | echo result');
  const activity = pipeActivity(model.commands, model.pipes[0]);
  assert.equal(activity.noWrites, false);
  assert.equal(activity.notRead, true);
  assert.equal(activity.label, 'pipe · not read');
});

test('sleep help, version, missing, invalid and dynamic arguments are not silent delays', () => {
  for (const source of ['sleep --help', 'sleep --version', 'sleep', 'sleep invalid', 'sleep "$DURATION"', 'sleep -1', 'sleep 2 --help']) {
    assert.notEqual(parsePipeline(source).commands[0].usage.fds[1].state, 'unused', source);
  }
  for (const source of ['sleep 2', 'sleep .5', 'sleep 1m 2s', 'sleep -- 2']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[1].state, 'unused', source);
  }
});

test('merging possible diagnostics prevents a no-writes claim', () => {
  for (const source of ['sleep 2 |& echo hello', 'sleep 2 2>&1 | echo hello']) {
    const model = parsePipeline(source);
    assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, false, source);
  }
});

test('redirect order preserves usage of the descriptor copied to a pipe', () => {
  const model = parsePipeline('sleep 2 2>&1 > output | echo hello');
  assert.equal(model.commands[0].fds[2], model.commands[1].fds[0]);
  assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, false);
  const silent = parsePipeline('sleep 2 2>/dev/null |& echo hello');
  assert.equal(pipeActivity(silent.commands, silent.pipes[0]).noWrites, false);
});

test('cat file arguments and explicit stdin operands affect only stdin usage', () => {
  for (const source of ['cat', 'cat -n', 'cat -', 'cat file -', 'cat -- -']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'possible', source);
  }
  for (const source of ['cat input.txt', 'cat -n input.txt', 'cat -- -filename', 'cat "two words"', 'cat --help']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  for (const source of ['cat "$FILE"', 'cat *.txt', 'cat --unknown', 'cat /dev/stdin', 'cat /proc/self/fd/0']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unknown', source);
  }
});

test('unknown commands and wrappers are not guessed from their names', () => {
  for (const source of ['custom', './sleep 2', 'env sleep 2', 'sudo echo hello', '"$COMMAND" 2', 'VAR=value sleep 2']) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.recognised, false, source);
    for (const fd of [0, 1, 2]) assert.equal(cmd.usage.fds[fd].state, 'unknown', source);
  }
});

test('quoted command names work and unmodelled extra descriptors stay unknown', () => {
  const model = parsePipeline('"sleep" 2 3>&1 | echo hello');
  assert.equal(model.commands[0].usage.fds[1].state, 'unused');
  assert.equal(portUsage(model.commands[0], 3).state, 'unknown');
  assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, false);
});

test('closed descriptors are marked closed regardless of command intent', () => {
  const cmd = parsePipeline('echo hello 1>&-').commands[0];
  assert.equal(cmd.usage.fds[1].state, 'possible');
  assert.equal(portUsage(cmd, 1).state, 'closed');
});

test('empty echo and printf are not conflated with guaranteed data transfer', () => {
  for (const source of ['echo -n', 'echo -n ""']) assert.equal(parsePipeline(source).commands[0].usage.fds[1].state, 'unused');
  for (const source of ['echo', 'echo -n "" ""', 'echo "$TEXT"', 'printf "%s" ""', 'printf -v value text']) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.fds[0].state, 'unused', source);
    assert.equal(cmd.usage.fds[1].state, 'possible', source);
  }
});

test('no-output exit commands are modelled only without arguments', () => {
  for (const name of ['true', 'false']) {
    const model = parsePipeline(`${name} | cat`);
    assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, true);
    assert.equal(parsePipeline(`${name} --help`).commands[0].usage.fds[1].state, 'unknown');
  }
});

test('all requested commands have recognised common invocations', () => {
  const cases = [
    ['wc -l', 'possible', 'possible'], ['base64 -d', 'possible', 'possible'],
    ['/usr/bin/time sleep 2', 'unused', 'unused'], ['true', 'unused', 'unused'],
    ['sleep 2', 'unused', 'unused'], ['printf "%s" hello', 'unused', 'possible'],
    ['cat', 'possible', 'possible'], ['xargs -n1 echo', 'possible', 'possible'],
    ['ls -la', 'unused', 'possible'], ['cut -d: -f1', 'possible', 'possible'],
    ['paste -d, - -', 'possible', 'possible'], ["awk '{print $1}'", 'possible', 'possible'],
    ["sed 's/hello/world/'", 'possible', 'possible'], ['rev', 'possible', 'possible'],
  ];
  for (const [source, stdin, stdout] of cases) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.recognised, true, source);
    assert.equal(cmd.usage.fds[0].state, stdin, source);
    assert.equal(cmd.usage.fds[1].state, stdout, source);
  }
});

test('option arguments are not mistaken for filenames', () => {
  for (const source of ['base64 -w 20', 'base64 --wrap=20', 'cut -d : -f 1', 'cut -sf1', 'paste -d -', 'paste --delimiters ,', 'wc -clw']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'possible', source);
  }
  for (const source of ['wc -l input', 'base64 -w20 input', 'cut -d- -f1 input', 'paste -sd, input', 'rev input', 'cat --number input']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  assert.equal(parsePipeline('rev -').commands[0].usage.fds[0].state, 'unused', 'util-linux rev treats - as a literal filename');
});

test('wc files0-from changes the source of file names', () => {
  assert.equal(parsePipeline('wc --files0-from=-').commands[0].usage.fds[0].state, 'possible');
  assert.equal(parsePipeline('wc --files0-from=list').commands[0].usage.fds[0].state, 'unused');
  assert.equal(parsePipeline('wc --files0-from="$LIST"').commands[0].usage.fds[0].state, 'unknown');
});

test('xargs alternate input accounts for the child inheriting stdin', () => {
  for (const source of ['xargs -a list', 'xargs --arg-file=list echo', 'xargs -a list -o cat']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  assert.equal(parsePipeline('xargs -a list cat').commands[0].usage.fds[0].state, 'possible');
  assert.equal(parsePipeline('xargs -a list custom').commands[0].usage.fds[0].state, 'unknown');
  assert.equal(parsePipeline('xargs -a /dev/stdin echo').commands[0].usage.fds[0].state, 'unknown');
  assert.equal(parsePipeline('xargs --help').commands[0].usage.fds[0].state, 'unused');
  assert.equal(parsePipeline('xargs echo --help').commands[0].usage.fds[0].state, 'possible', 'child options belong to the child');
});

test('time inherits child usage but can always write timing diagnostics', () => {
  for (const source of ['/usr/bin/time -v sleep 2', '/usr/bin/time -f "%e" sleep 2', '/usr/bin/time -o timings sleep 2']) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.fds[0].state, 'unused', source);
    assert.equal(cmd.usage.fds[1].state, 'unused', source);
    assert.equal(cmd.usage.fds[2].state, 'possible', source);
  }
  const model = parsePipeline('/usr/bin/time sleep 2 |& wc -l');
  assert.equal(pipeActivity(model.commands, model.pipes[0]).noWrites, false);
  assert.equal(parsePipeline('/usr/bin/time cat').commands[0].usage.fds[0].state, 'possible');
  assert.equal(parsePipeline('/usr/bin/time custom').commands[0].usage.fds[0].state, 'unknown');
  assert.equal(parsePipeline('/usr/bin/time -V').commands[0].usage.fds[0].state, 'unused');
  assert.equal(parsePipeline('/usr/bin/time -o /dev/stdout sleep 2').commands[0].usage.fds[1].state, 'possible');
});

test('awk accounts for scripts, data files and BEGIN-only programs', () => {
  for (const source of ["awk -F: '{print $1}'", "awk -v label=x '{print label}'", 'awk -f script', 'awk -f - data']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'possible', source);
  }
  for (const source of ["awk '{print $1}' data", "awk 'BEGIN {print 1}'", "awk -F: '{print $1}' data"]) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  for (const source of ["awk '{getline; print}' data", "awk '{print}' /dev/stdin", 'awk -f script data', "awk 'BEGIN {system(\"cat\")}'"]) {
    assert.notEqual(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
});

test('sed preserves input dependencies from every script', () => {
  for (const source of ["sed -n 'p'", "sed -e 's/a/b/'", 'sed -f script', 'sed -f - data']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'possible', source);
  }
  for (const source of ["sed 's/a/b/' data", "sed -n 'p' data", "sed -e 's/a/b/' -e 's/c/d/' data"]) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  for (const source of ["sed -e 'e cat' -e 's/a/b/' data", "sed 's/a/b/e' data", "sed 's/a/b/' /dev/stdin", 'sed -f script data']) {
    assert.notEqual(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  assert.equal(parsePipeline("sed -i.bak 's/a/b/' data").commands[0].usage.fds[1].state, 'unused');
});

test('unresolved file arguments and options remain conservative for known commands', () => {
  for (const source of ['wc "$FILE"', 'base64 --unsupported', 'cut -f', 'paste *.txt', 'rev /dev/stdin', 'true "$OPTION"']) {
    const cmd = parsePipeline(source).commands[0];
    assert.equal(cmd.usage.recognised, true, source);
    assert.notEqual(cmd.usage.fds[source.startsWith('true') ? 1 : 0].state, 'unused', source);
  }
});

test('head and tail read named files or stdin and may write stdout', () => {
  for (const source of ['head', 'head -n 5', 'head -5', 'head -c 10M -', 'tail', 'tail -n +2', 'tail -2', 'tail +2', 'tail -f', 'tail --follow=name -n 1 -']) {
    const [cmd] = parsePipeline(source).commands;
    assert.equal(cmd.usage.recognised, true, source);
    assert.equal(cmd.usage.fds[0].state, 'possible', source);
    assert.equal(cmd.usage.fds[1].state, 'possible', source);
    assert.equal(cmd.usage.fds[2].label, 'on error', source);
  }
  for (const source of ['head -c 10M /dev/urandom', 'head -5 notes.txt', 'tail -n 3 a b', 'tail +2 notes.txt', 'tail -F app.log']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unused', source);
  }
  // With more than one operand, GNU tail reads +2 as a file name.
  assert.equal(parsePipeline('tail +2 a b').commands[0].usage.fds[0].state, 'unused');
  for (const source of ['head --unknown', 'tail -n', 'head "$FILE"', 'head /dev/stdin']) {
    assert.equal(parsePipeline(source).commands[0].usage.fds[0].state, 'unknown', source);
  }
  const time = parsePipeline('/usr/bin/time -f %M head -c 10M /dev/urandom').commands[0];
  assert.equal(time.usage.fds[1].state, 'possible');
});
