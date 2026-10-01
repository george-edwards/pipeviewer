import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline, targetsOf } from '../parser.js';

// Cases from zsh 5.8 runs with default options; macOS ships 5.9 with the same rules.
const zsh = source => parsePipeline(source, { platform: 'macos' });
const ids = dest => targetsOf(dest).map(target => target.type === 'file' || target.type === 'null' ? target.label : target.id);

test('MULTIOS: a later redirect adds a destination instead of replacing the pipe or an earlier one', () => {
  assert.deepEqual(ids(zsh('echo hi > a > b').commands[0].fds[1]), ['a', 'b']);
  assert.deepEqual(ids(zsh('echo hi > a | tr a-z A-Z').commands[0].fds[1]), ['pipe-0', 'a']);
  // The “grep only stderr” idiom sends grep both streams under zsh.
  const idiom = zsh('cmd 2>&1 > /dev/null | grep x').commands[0];
  assert.deepEqual(ids(idiom.fds[1]), ['pipe-0', '/dev/null']);
  assert.deepEqual(ids(idiom.fds[2]), ['pipe-0']);
  const twice = zsh('cmd > a 2>&1 > b').commands[0];
  assert.deepEqual([ids(twice.fds[1]), ids(twice.fds[2])], [['a', 'b'], ['a']]);
  const swap = zsh('cmd 3>&1 1>&2 2>&3 | sed x').commands[0];
  assert.deepEqual([ids(swap.fds[1]), ids(swap.fds[2])], [['pipe-0', 'terminal-err'], ['pipe-0']]);
  const copy = zsh('echo hi >&2 > f 2> /dev/null').commands[0];
  assert.deepEqual([ids(copy.fds[1]), ids(copy.fds[2])], [['terminal-err', 'f'], ['/dev/null']]);
});

test('&> and |& under MULTIOS', () => {
  const both = zsh('cmd &> a | sed x').commands[0];
  assert.deepEqual([ids(both.fds[1]), ids(both.fds[2])], [['pipe-0', 'a'], ['a']]);
  const merged = zsh('cmd > a |& sed x').commands[0];
  assert.deepEqual([ids(merged.fds[1]), ids(merged.fds[2])], [['pipe-0', 'a'], ['pipe-0', 'a']]);
  assert.deepEqual(ids(zsh('cmd 2> a |& sed x').commands[0].fds[2]), ['a', 'pipe-0']);
});

test('input multios join their sources, and a close drops every target', () => {
  assert.deepEqual(ids(zsh('echo P | cat < a').commands[1].fds[0]), ['pipe-0', 'a']);
  assert.deepEqual(ids(zsh('cat < a < b').commands[0].fds[0]), ['a', 'b']);
  assert.equal(zsh('echo hi > a >&- | cat').commands[0].fds[1].type, 'closed');
  // A descriptor redirected once matches Bash.
  assert.equal(zsh('cmd > a 2>&1').commands[0].fds[2].label, 'a');
});

test('Bash keeps its single-destination rules on the same lines', () => {
  assert.equal(parsePipeline('echo hi > a > b').commands[0].fds[1].label, 'b');
  assert.equal(parsePipeline('cmd 2>&1 > /dev/null | grep x').commands[0].fds[1].label, '/dev/null');
});

test('zsh process substitutions, digits, comments and redirect-only lines', () => {
  // An argument substitution gets the shell's descriptors; a redirect target sees the pipe.
  const argument = zsh('echo hi | tee >(sed x) | sed y');
  assert.equal(argument.substitutions[0].commands[0].fds[1].id, 'terminal-out');
  assert.equal(parsePipeline('echo hi | tee >(sed x) | sed y').substitutions[0].commands[0].fds[1].id, 'pipe-1');
  const redirect = zsh('echo out > >(sed x) | sed y');
  assert.equal(redirect.substitutions[0].commands[0].fds[1].id, 'pipe-0');
  assert.equal(redirect.substitutions[0].fd, 11);
  assert.equal(zsh('echo hi 10> a').commands[0].command, 'echo hi 10');
  assert.equal(zsh('echo hi # note').commands[0].command, 'echo hi # note');
  const nullcmd = zsh('> out');
  assert.equal(nullcmd.commands[0].command, 'cat');
  assert.match(nullcmd.notes.join(' '), /zsh runs cat/);
  assert.equal(zsh('< in').commands[0].command, 'more');
  assert.throws(() => parsePipeline('> out'));
});
