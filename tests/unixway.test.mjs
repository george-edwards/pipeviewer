import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline } from '../parser.js';
import { run, screenLines, sameLine, tools, BUFFER } from '../sandbox.js';
import { files, levels } from '../unixway.js';

const shell = (source, platform = 'linux') => run(parsePipeline(source, { platform }), files, { platform });
const screen = (source, platform) => source.trim() ? screenLines(shell(source, platform)) : [];
const out = (source, platform) => screen(source, platform).filter(line => line.fd === 1).map(line => line.text);
const err = (source, platform) => screen(source, platform).filter(line => line.fd === 2).map(line => line.text);
const matches = (a, b) => a.length === b.length && a.every((line, i) => line.fd === b[i].fd && sameLine(line.text, b[i].text));
const field = (level, key, platform) => platform === 'macos' && level.mac?.[key] !== undefined ? level.mac[key] : level[key];

test('every level’s target prints something, no errors, and holds no more than it may, on both systems', () => {
  for (const level of levels) for (const platform of ['linux', 'macos']) {
    const target = field(level, 'target', platform), result = shell(target, platform);
    assert.ok(screenLines(result).length, `${level.id} on ${platform}`);
    assert.deepEqual(screenLines(result).filter(line => line.fd === 2), [], `${level.id} on ${platform}`);
    if (level.memory) for (const cmd of result.commands) assert.ok(cmd.held <= level.memory, `${level.id}: ${cmd.name}`);
  }
});
test('every level starts away from its target, and has the parts it needs', () => {
  levels.forEach((level, i) => {
    for (const platform of ['linux', 'macos']) {
      const start = field(level, 'start', platform) ?? field(levels[i - 1], 'target', platform);
      const sameOutput = matches(screen(start, platform), screen(field(level, 'target', platform), platform));
      const tooHeavy = level.memory && shell(start, platform).commands.some(cmd => cmd.held > level.memory);
      assert.ok(!sameOutput || tooHeavy, `${level.id} on ${platform}`);
      for (const name of field(level, 'tools', platform)) assert.ok(tools[name], `${level.id}: card for ${name}`);
    }
    for (const key of ['id', 'title', 'brief', 'target', 'how', 'learned']) assert.ok(level[key], `${level.id}: ${key}`);
  });
  assert.equal(new Set(levels.map(level => level.id)).size, levels.length);
});
test('the spelling checker finds the four typos', () => {
  assert.deepEqual(out(levels.find(level => level.id === 'comm').target), ['arive', 'exeptions', 'lable', 'pateince']);
});
test('devices behave as devices', () => {
  assert.deepEqual(out('echo hi > /dev/tty'), ['hi']);
  assert.deepEqual(out('echo hi > /dev/null; wc -c < /dev/null'), ['0']);
  assert.deepEqual(out('head -c 1M /dev/zero | wc -c'), ['1048576']);
  assert.deepEqual(err('head -c 1M /dev/zero', 'macos'), ['head: illegal byte count -- 1M']);
  // The random bytes are the same every run, so an answer can be checked.
  assert.deepEqual(out('head -c 12 /dev/urandom | base64'), out('head -c 12 /dev/urandom | base64'));
  assert.equal(out('head -c 12 /dev/urandom | base64')[0].length, 16);
  assert.match(shell('cat /dev/zero | wc -c').notes[0], /never runs dry/);
  assert.deepEqual(out('ls /dev'), ['null  random  stderr  stdin  stdout  tty  urandom  zero']);
  assert.deepEqual(err('cat /dev'), ['cat: /dev: Is a directory']);
});
test('Linux has /proc and macOS has sysctl', () => {
  assert.deepEqual(out('grep -c processor /proc/cpuinfo'), ['8']);
  assert.deepEqual(err('grep -c processor /proc/cpuinfo', 'macos'), ['grep: /proc/cpuinfo: No such file or directory']);
  assert.deepEqual(out('sysctl -n hw.ncpu', 'macos'), ['8']);
  assert.match(out('cut -d: -f1 /etc/passwd', 'macos')[0], /^##/);
});
test('base64 wraps on Linux, not on macOS, and decodes', () => {
  assert.deepEqual(out('head -c 1000000 /dev/urandom | base64 | wc -c'), ['1350880']);
  assert.deepEqual(out('head -c 1000000 /dev/urandom | base64 | wc -c', 'macos').map(line => line.trim()), ['1333337']);
  assert.deepEqual(out('echo hello | base64 | base64 -d'), ['hello']);
});
test('streaming tools hold a buffer at most; sort and tac hold everything', () => {
  const held = source => Object.fromEntries(shell(source).commands.map(cmd => [cmd.name, cmd.held]));
  assert.deepEqual(held('seq 100000 | sort -rn | head -n 1'), { seq: 0, sort: 588895, head: BUFFER });
  assert.equal(held('seq 100000 | tac | head -n 1').tac, 588895);
  assert.deepEqual(held('seq 100000 | tail -n 1'), { seq: 0, tail: BUFFER });
});
test('exit statuses are kept per command, and skipped commands say so', () => {
  const statuses = source => shell(source).commands.map(cmd => cmd.status);
  assert.deepEqual(statuses('cp memo.txt b.txt && diff memo.txt nope && echo same'), [0, 2, null]);
  assert.deepEqual(statuses('false || echo rescued'), [1, 0]);
  assert.deepEqual(out('cp memo.txt b.txt && diff memo.txt b.txt && echo same'), ['same']);
});
test('software has to be installed, as root with apt and not with brew', () => {
  assert.deepEqual(err('cowsay moo'), ['bash: cowsay: command not found']);
  assert.match(err('apt install cowsay')[1], /are you root\?$/);
  assert.ok(out('sudo apt install cowsay && cowsay moo').includes('< moo >'));
  assert.deepEqual(err('apt install cowsay', 'macos'), ['zsh: command not found: apt']);
  assert.match(err('sudo brew install cowsay', 'macos')[0], /^Error: Running Homebrew as root/);
  assert.ok(out('brew install cowsay && cowsay moo', 'macos').includes('< moo >'));
  // An install lasts only for the command line it's on.
  assert.deepEqual(err('sudo apt install cowsay; cowsay hi').length, 0);
});
test('comm warns about unsorted input, as GNU comm does', () => {
  assert.deepEqual(err("tr -cs A-Za-z '\\n' < memo.txt | comm -23 - words.txt").slice(-1), ['comm: input is not in sorted order']);
});
