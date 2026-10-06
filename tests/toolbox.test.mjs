import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline } from '../parser.js';
import { run, screenLines, sameLine, tools } from '../sandbox.js';
import { files, clues } from '../cases.js';

const shell = (source, platform = 'linux', on = files) => run(parsePipeline(source, { platform }), on, { platform });
// An empty editor prints nothing.
const screen = (source, platform) => source.trim() ? screenLines(shell(source, platform)) : [];
const out = (source, platform) => screen(source, platform).filter(line => line.fd === 1).map(line => line.text);
const err = (source, platform) => screen(source, platform).filter(line => line.fd === 2).map(line => line.text);
const matches = (a, b) => a.length === b.length && a.every((line, i) => line.fd === b[i].fd && sameLine(line.text, b[i].text));

// The note in the bin turns up by mail partway through, so the files grow by one.
test('each question’s last nudge finds its answer, on both systems, with no errors', () => {
  for (const clue of clues) for (const platform of ['linux', 'macos']) {
    const example = clue.nudges.at(-1).try, result = shell(example, platform);
    assert.ok(example, `${clue.id} ends with a command to try`);
    assert.deepEqual(screenLines(result).filter(line => line.fd === 2), [], `${clue.id} on ${platform}`);
    assert.ok(clue.found(screenLines(result).map(line => line.text).join('\n'), result), `${clue.id} on ${platform}: ${example}`);
  }
  assert.equal(new Set(clues.map(clue => clue.id)).size, clues.length);
});

// Basic Training is for people who don't know the commands yet, so every nudge names one to try.
test('every nudge gives a command to try', () => {
  for (const clue of clues) for (const nudge of clue.nudges) assert.ok(nudge.try, `${clue.id}: ${nudge.text}`);
});
test('other routes to an answer count too', () => {
  const finds = (id, source) => { const result = shell(source); return clues.find(clue => clue.id === id).found(screenLines(result).map(line => line.text).join('\n'), result); };
  assert.ok(finds('kitchen', "grep kitchen swipes.log | grep 2026-10-02T15:0 | awk '{print $3}' | sort -u"));
  assert.ok(finds('kitchen', "grep 2026-10-02T15:0 swipes.log | grep kitchen | cut -d ' ' -f 3 | sort | uniq -c"));
  assert.ok(!finds('kitchen', 'grep kitchen swipes.log'));
  assert.ok(finds('most', "grep 2026-10-02T15:0 swipes.log | grep kitchen | awk '{print $3}' | sort | uniq -c | sort -rn | head -n 1"));
  assert.ok(finds('when', 'cat pantry-1500.txt pantry-1510.txt'));
  assert.ok(!finds('look', 'cat README'));
  assert.ok(finds('whois', 'grep ^jlee: staff.txt'));
  assert.ok(finds('note', "sort -n found-in-bin.txt | cut -d ' ' -f 2-"));
  assert.ok(!finds('note', 'cat found-in-bin.txt | sort'));
});
test('the case comes out the same way every time', () => {
  assert.deepEqual(out("grep 2026-10-02T15:0 swipes.log | grep kitchen | cut -d ' ' -f 3 | sort | uniq -c | sort -rn | head -n 1").map(line => line.trim()), ['4 jlee']);
  assert.deepEqual(out('grep jlee staff.txt').length, 2);
  assert.deepEqual(out('grep -w jlee staff.txt'), ['jlee:Jo Lee:Hydrology:3']);
  assert.deepEqual(out('sort -n found-in-bin.txt').slice(0, 2), ['1 Sorry.', '2 I had a grant']);
  assert.equal(out('sort found-in-bin.txt')[1], '10 J');
  assert.ok(Number(out('wc -l < swipes.log')[0]) > 200);
});
test('other spellings of a target print the same', () => {
  const same = (a, b) => assert.ok(matches(screen(a), screen(b)), `${a} vs ${b}`);
  same('sort -n < found-in-bin.txt', 'cat found-in-bin.txt | sort -n');
  same("grep 2026-10-02T15:0 swipes.log | grep kitchen | cut -d ' ' -f 3", "grep kitchen swipes.log | grep 2026-10-02T15:0 | awk '{print $3}'");
  same('wc -l swipes.log', 'wc -l swipes.log');
  same('grep -w jlee staff.txt', 'grep ^jlee: staff.txt');
  // GNU and BSD pad uniq -c and wc differently; the words are what count.
  assert.ok(matches(screen('sort staff.txt | cut -c 1 | uniq -c', 'linux'), screen('sort staff.txt | cut -c 1 | uniq -c', 'macos')));
});
test('commands fail as the real ones do', () => {
  assert.deepEqual(err('tr a-z A-Z staff.txt'), ["tr: extra operand 'staff.txt'", "Try 'tr --help' for more information."]);
  assert.deepEqual(err('cat nope.txt'), ['cat: nope.txt: No such file or directory']);
  assert.deepEqual(err('nope'), ['bash: nope: command not found']);
  assert.deepEqual(err('nope', 'macos'), ['zsh: command not found: nope']);
  assert.deepEqual(err('sort < nope.txt'), ['bash: nope.txt: No such file or directory']);
  assert.equal(shell('grep zzz staff.txt').status, 1);
  assert.equal(shell('grep zzz staff.txt || echo none').terminal[0].text, 'none\n');
});
test('redirects and pipes go where the parser says', () => {
  const result = shell('sort staff.txt > sorted.txt 2> errors.txt');
  assert.deepEqual(result.terminal, []);
  assert.equal(result.files['sorted.txt'].split('\n')[0], 'amorgan:Alex Morgan:Agronomy:3');
  assert.deepEqual(result.written, ['sorted.txt', 'errors.txt']);
  // The shell empties the file before sort reads it.
  assert.equal(shell('sort staff.txt > staff.txt').files['staff.txt'], '');
  assert.deepEqual(err('cat nope 2>&1 | wc -l'), []);
  assert.deepEqual(out('cat nope 2>&1 | wc -l'), ['1']);
  assert.deepEqual(err('echo oops >&2'), ['oops']);
  assert.deepEqual(out('ls *.txt | wc -l'), ['4']);
  assert.deepEqual(out("echo 'a  b' | tr -s ' '"), ['a b']);
});
test('a command reading the keyboard says so instead of hanging', () => {
  const result = shell('grep jlee');
  assert.deepEqual(result.terminal, []);
  assert.match(result.notes[0], /^grep is reading the keyboard/);
});
test('the tools print their usual formats', () => {
  assert.deepEqual(out('wc -l staff.txt'), ['15 staff.txt']);
  assert.deepEqual(out('wc -l staff.txt', 'macos'), ['      15 staff.txt']);
  assert.deepEqual(out('diff pantry-1500.txt pantry-1510.txt'), ['1c1', "< Arnott's Tim Tams     1 packet", '---', "> Arnott's Tim Tams     0 packets"]);
  assert.deepEqual(out('head -n 2 staff.txt | tail -n 1'), ['bnguyen:Bao Nguyen:Data Science:2']);
  assert.deepEqual(out('cut -d : -f 3 staff.txt | sort -u | head -n 2'), ['Agronomy', 'Data Science']);
  assert.deepEqual(out("sed -n '/^z/p' staff.txt"), ['zbrown:Zoe Brown:Facilities:1']);
  assert.deepEqual(out('seq 3 | sort -rn'), ['3', '2', '1']);
  assert.deepEqual(out('echo hello | rev'), ['olleh']);
  assert.match(out('man grep')[0], /^GREP$/);
  assert.equal(out('ls')[0], 'README  found-in-bin.txt  pantry-1500.txt  pantry-1510.txt  staff.txt  swipes.log');
  assert.equal(out('ls | head -n 1')[0], 'README');
});
test('--help works for every command on Linux, and is an illegal option for BSD tools on macOS', async () => {
  const { known } = await import('../sandbox.js');
  for (const name of known.filter(name => !['echo', 'true', 'false', 'cd'].includes(name))) {
    const result = shell(`${name} --help`);
    assert.equal(result.status, 0, name);
    assert.match(result.terminal[0]?.text ?? '', /^Usage: /, name);
  }
  assert.deepEqual(out('echo --help'), ['--help']);
  assert.match(out('sudo apt --help')[0], /^Usage: sudo apt install/);
  assert.deepEqual(err('grep --help', 'macos'), ['grep: illegal option -- -', 'usage: grep [-ivcnw] pattern [file…]']);
  assert.match(out('brew --help', 'macos')[0], /^Usage: brew/);
  // The errors that suggest --help on Linux print a usage line on macOS instead.
  assert.equal(err('tr a').at(-1), "Try 'tr --help' for more information.");
  assert.equal(err('tr a', 'macos').at(-1), 'usage: tr [-d] [-s] SET1 [SET2]');
});
