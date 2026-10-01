import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline } from '../parser.js';

const mac = source => parsePipeline(source, { platform: 'macos' });
const states = source => { const { usage } = mac(source).commands[0]; return [0, 1, 2].map(fd => usage.fds[fd].state); };
const stdin = source => states(source)[0], stdout = source => states(source)[1];

test('commands missing from macOS stay unknown with a hint', () => {
  for (const source of ['tac f', 'timeout 5 sleep 1', 'nproc', 'shuf', 'b2sum f', 'base32 f', 'gawk 1', 'dir', 'wget https://x']) {
    const model = mac(source);
    assert.equal(model.commands[0].usage.recognised, false, source);
    assert.match(model.notes.join(' '), /not installed on macOS/, source);
  }
  assert.match(mac('tac f').notes[0], /tail -r/);
  // macOS-only tools are missing on Linux.
  assert.match(parsePipeline('pbpaste').notes[0], /not installed on Linux/);
});

test('BSD tools: - is a file, options stop at the first operand, and BSD-only options', () => {
  for (const source of ['head -', 'tail -', 'wc -', 'sed p -', 'rev -']) assert.equal(stdin(source), 'unused', source);
  for (const source of ['cat -', 'cut -f1 -', 'sort -', 'grep x -']) assert.equal(stdin(source), 'possible', source);
  // BSD uniq stops at its first operand, so -c here is the output file.
  assert.equal(stdout('uniq in -c'), 'unused');
  assert.equal(parsePipeline('uniq in -c').commands[0].usage.fds[1].state, 'possible');
  assert.equal(stdin('wc --libxo=json'), 'possible');
  assert.equal(stdin('paste'), 'unused');
});

test('BSD sed, date, base64, find, md5 and zcat', () => {
  // -i takes the next word as a backup suffix.
  assert.equal(stdout("sed -i '' s/a/b/ f"), 'unused');
  assert.match(mac('sed -i s/a/b/ f').notes.join(' '), /backup suffix/);
  assert.equal(stdin('date -j -f %Y 2024 +%s'), 'unused');
  assert.equal(stdin('base64'), 'possible');
  assert.equal(stdin('base64 -i f'), 'unused');
  assert.equal(stdout('base64 -o out'), 'unused');
  assert.match(mac('base64 file').notes.join(' '), /no file operands/);
  assert.equal(stdin('find -name x'), 'unknown');
  assert.equal(stdin('find . -name x'), 'unused');
  assert.equal(stdin('md5 -s hello'), 'unused');
  assert.equal(stdin('md5 -p'), 'possible');
  assert.equal(stdin('md5'), 'possible');
  assert.match(mac('zcat logs.gz').notes.join(' '), /gzcat/);
  assert.equal(mac('gzcat logs.gz').notes.length, 0);
});

test('macOS tools and wrappers', () => {
  assert.deepEqual(states('pbcopy').slice(0, 2), ['possible', 'unused']);
  assert.deepEqual(states('pbpaste').slice(0, 2), ['unused', 'possible']);
  assert.equal(stdin('say'), 'possible');
  assert.equal(stdin('say hello'), 'unused');
  assert.equal(stdin('arch -x86_64 cat'), 'possible');
  assert.equal(stdin('caffeinate sleep 5'), 'unused');
  // BSD nice needs a command, and BSD nohup leaves stdin alone.
  assert.equal(stdin('nice'), 'unknown');
  assert.doesNotMatch(mac('nohup cat').commands[0].usage.fds[0].reason, /unreadable/);
  assert.equal(stdin('stty -f /dev/ttys001 -a'), 'unused');
  assert.equal(stdin('rm -f -I a b c d'), 'possible');
});
