import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline, destinationLabel } from '../parser.js';

test('standard descriptors connect across a pipeline', () => {
  const { commands: [a, b] } = parsePipeline('cat input | sort');
  assert.equal(a.fds[0].id, 'terminal-in');
  assert.equal(a.fds[1], b.fds[0]);
  assert.equal(b.fds[1].id, 'terminal-out');
  assert.equal(a.fds[2].id, 'terminal-err');
});
test('descriptor copies capture the current destination, not future redirects', () => {
  const a = parsePipeline('cmd > out 2>&1').commands[0];
  assert.equal(a.fds[1], a.fds[2]);
  const b = parsePipeline('cmd 2>&1 > out').commands[0];
  assert.equal(b.fds[2].id, 'terminal-out');
  assert.equal(b.fds[1].label, 'out');
});
test('pipes are assigned before redirects', () => {
  const { commands: [a, b] } = parsePipeline('cmd 2>&1 > out | next');
  assert.equal(a.fds[2], b.fds[0]);
  assert.equal(a.fds[1].label, 'out');
});
test('|& copies stdout after explicit redirects', () => {
  const model = parsePipeline('cmd > out 2> errors |& next');
  assert.equal(model.commands[0].fds[1], model.commands[0].fds[2]);
  assert.equal(model.commands[0].fds[2].label, 'out');
  assert.match(model.notes[0], /no writer/);
});
test('quotes and escapes protect operator characters', () => {
  const model = parsePipeline('printf "a|b" \\| \'2>f\' | grep "a" > "file with spaces"');
  assert.equal(model.commands.length, 2);
  assert.equal(model.commands[1].fds[1].label, 'file with spaces');
});
test('only an adjacent unquoted number names a descriptor', () => {
  const a = parsePipeline('echo 2 > out').commands[0];
  assert.equal(a.command, 'echo 2');
  assert.equal(a.fds[2].id, 'terminal-err');
  const b = parsePipeline('echo "2"> out').commands[0];
  assert.equal(b.command, 'echo "2"');
  const c = parsePipeline('echo 2> out').commands[0];
  assert.equal(c.fds[2].label, 'out');
});
test('read, append, combined output, null, and close redirects', () => {
  const a = parsePipeline('sort < input >> output 2>/dev/null').commands[0];
  assert.equal(a.fds[0].mode, 'read');
  assert.equal(a.fds[1].mode, 'append');
  assert.equal(a.fds[2].type, 'null');
  const b = parsePipeline('cmd &>> all').commands[0];
  assert.equal(b.fds[1], b.fds[2]);
  assert.equal(b.fds[2].mode, 'append');
  assert.equal(parsePipeline('cmd 2>&-').commands[0].fds[2].type, 'closed');
});
test('extra descriptors can save and restore destinations', () => {
  const a = parsePipeline('cmd 3>&1 1>out 2>&3 3>&-').commands[0];
  assert.equal(a.fds[2].id, 'terminal-out');
  assert.equal(a.fds[3].type, 'closed');
});
test('overridden input pipe reports no reader', () => {
  const model = parsePipeline('cmd | sort < input');
  assert.match(model.notes[0], /no reader/);
});
test('comments and line continuations', () => {
  assert.equal(parsePipeline('cat \\\n input | sort # a comment').commands.length, 2);
  assert.equal(parsePipeline('echo a#b').commands[0].command, 'echo a#b');
});
test('unsupported and incomplete syntax produces actionable errors', () => {
  for (const source of ['', 'cmd |', '| cmd', 'cmd >', 'cmd "oops', 'cmd &&', '&& cmd', 'cmd ;; other', 'cmd &', 'cmd << EOF', 'echo $(whoami)', 'echo `pwd`', 'cmd > $HOME/out', 'cmd 2>&9', 'cmd 3>&- 2>&3', 'cmd > ""']) {
    assert.throws(() => parsePipeline(source), Error, source);
  }
});
test('quoted literal expansion characters in filenames stay literal', () => {
  assert.equal(parsePipeline("cmd > '$literal'").commands[0].fds[1].label, '$literal');
  assert.equal(parsePipeline('cmd > "a*b"').commands[0].fds[1].label, 'a*b');
});
test('null input supplies end-of-file rather than discarding output', () => {
  const cmd = parsePipeline('cat < /dev/null').commands[0];
  assert.equal(destinationLabel(cmd.fds[0], 0), '/dev/null · end-of-file');
});
test('/dev/tty redirects reach the terminal rather than a file', () => {
  const [a] = parsePipeline('cmd > /dev/tty 2>>/dev/tty < /dev/tty').commands;
  assert.deepEqual([a.fds[0].id, a.fds[1].id, a.fds[2].id], ['terminal-in', 'terminal-out', 'terminal-err']);
  assert.match(a.steps[0].description, /Terminal output \(\/dev\/tty\)/);
  const [b] = parsePipeline('cmd &> /dev/tty').commands;
  assert.equal(b.fds[1], b.fds[2]);
  assert.equal(b.fds[2].type, 'terminal');
  const model = parsePipeline('/usr/bin/time -f %M 2> >(cat 1>/dev/tty) head -c 10M /dev/urandom | base64 1>/dev/null');
  assert.equal(model.substitutions[0].commands[0].fds[1].id, 'terminal-out');
  assert.equal(parsePipeline("cmd > '/dev/tty'").commands[0].fds[1].id, 'terminal-out');
});
test('/dev/stdout, /dev/stderr, and /dev/stdin reach the current destination of 1, 2, and 0', () => {
  const { commands: [a, b] } = parsePipeline('ls x 2>/dev/stdout | grep y > /dev/stderr');
  assert.equal(a.fds[2], b.fds[0]);
  assert.equal(b.fds[1].id, 'terminal-err');
  const [c] = parsePipeline('cmd > out 2>/dev/stdout').commands;
  assert.equal(c.fds[2], c.fds[1]);
  assert.match(c.steps[1].description, /overwrite each other/);
  const [d] = parsePipeline('cmd < in 3</dev/stdin').commands;
  assert.equal(d.fds[3].label, 'in');
  assert.throws(() => parsePipeline('cmd 1>&- 2>/dev/stdout'), /descriptor 1/);
});
test('&&, || and ; split a command line into pipelines that each start from the terminal', () => {
  const model = parsePipeline('sort f > out && wc -l < out || echo failed; cat f | head');
  assert.deepEqual(model.pipelines.map(p => p.operator), [null, '&&', '||', ';']);
  assert.deepEqual(model.pipelines.map(p => p.commands.map(cmd => cmd.key)), [['1'], ['2'], ['3'], ['4', '5']]);
  assert.equal(model.all.length, 5);
  for (const pipeline of model.pipelines) assert.equal(pipeline.commands[0].fds[2].id, 'terminal-err');
  assert.equal(model.pipelines[1].commands[0].fds[0].label, 'out');
  // Pipe endpoints stay distinct between pipelines.
  assert.notEqual(model.pipelines[3].pipes[0].id, 'pipe-0');
  assert.equal(parsePipeline('cmd').pipelines.length, 1);
});
test('newlines separate commands unless a line ends with |, && or ||', () => {
  assert.deepEqual(parsePipeline('a\n\nb |\n c\nd &&\n e').pipelines.map(p => [p.operator, p.commands.length]), [[null, 1], [';', 2], [';', 1], ['&&', 1]]);
  assert.equal(parsePipeline('a;').pipelines.length, 1);
  assert.throws(() => parsePipeline('cat <(a; b)'), /one pipeline inside a process substitution/);
});
test('restyle adds or drops the implied descriptor on redirects only', async () => {
  const { restyle } = await import('../parser.js');
  assert.equal(restyle('grep 0<access.log "404" 1>errors.log 2>&1', 'common'), 'grep <access.log "404" >errors.log 2>&1');
  assert.equal(restyle('sort < in > out && echo no >&2 >> log', 'explicit'), 'sort 0< in 1> out && echo no 1>&2 1>> log');
  // Quoted text, &> and other descriptors stay as written.
  assert.equal(restyle("awk '$1>2' f \"a > b\" &> all 3>&1", 'explicit'), "awk '$1>2' f \"a > b\" &> all 3>&1");
  assert.equal(restyle('cat < <(sort > x)', 'explicit'), 'cat 0< <(sort 1> x)');
  assert.equal(restyle('cat "oops', 'common'), 'cat "oops');
});
