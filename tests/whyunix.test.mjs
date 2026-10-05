import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runLine, reset, read, FS, SCRIPT, BLOCKLIST, ATTACKER } from '../whyshell.js';

const out = line => runLine(line).out;
const err = line => runLine(line).err;
const PIPELINE = "grep ' 401 ' access.log | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -3";
beforeEach(reset);

test('the six tools, in order, find the attacker', () => {
  assert.deepEqual(out(`cat access.log | ${PIPELINE.replace(' access.log', '')}`), ['    183 203.0.113.42', '     27 198.51.100.7', '      9 10.0.4.17']);
  assert.deepEqual(out(PIPELINE), out(`cat access.log | ${PIPELINE.replace(' access.log', '')}`));
  // Counting before sorting counts runs, not addresses, so the answer differs.
  assert.notDeepEqual(out("grep ' 401 ' access.log | cut -d' ' -f1 | uniq -c | sort -rn | head -3"), out(PIPELINE));
});
test('blocking the attacker is one line appended to a text file', () => {
  assert.deepEqual(err(`echo "deny ${ATTACKER};" >> ${BLOCKLIST}`), []);
  assert.equal(read(BLOCKLIST).at(-1), `deny ${ATTACKER};`);
  assert.equal(read(BLOCKLIST).length, 3);
  assert.match(err('echo hi > /proc/uptime')[0], /Permission denied/);
});
test('the saved script runs on each new log and can be piped like any tool', () => {
  assert.match(err('who-failed mon.log')[0], /command not found/);
  FS[SCRIPT] = ['#!/bin/sh', '# comment', `grep ' 401 ' "$1" | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -3`];
  assert.deepEqual(out('who-failed mon.log').map(line => line.trim()), ['61 192.0.2.200', '19 198.51.100.7', '5 10.0.4.17']);
  assert.deepEqual(out('who-failed wed.log | head -1').map(line => line.trim()), ['240 203.0.113.99']);
  assert.equal(out('who-failed tue.log').length, 3);
});
test('a missing tool is installed from the repository, with sudo', () => {
  assert.deepEqual(err(`whois ${ATTACKER}`), ["Command 'whois' not found, but can be installed with:", '  sudo apt install whois']);
  assert.match(err('apt install whois')[1], /are you root/);
  const install = runLine('sudo apt install whois');
  assert.ok(install.slow);
  assert.match(install.out.at(-1), /^Setting up whois/);
  assert.ok(out(`whois ${ATTACKER}`).some(line => line.includes('TEST-NET-3')));
  assert.match(out('sudo apt install whois').at(-1), /0 newly installed/);
  assert.match(err('sudo apt install photoshop')[0], /Unable to locate package photoshop/);
  assert.ok(out('apt search cow').includes('  configurable talking cow'));
  assert.match(out('sudo apt upgrade').join('\n'), /6 upgraded/);
  assert.match(out('sudo apt upgrade').join('\n'), /0 upgraded/);
  runLine('brew install cowsay');
  assert.equal(out('echo moo | cowsay')[1], '< moo >');
});
test('the shell explains itself', () => {
  assert.ok(out('apropos count').some(line => line.startsWith('uniq')));
  assert.equal(out('sort --help')[0], 'usage: sort [-r] [-n] [-u] [FILE]');
  assert.ok(out('man grep').includes('OPTIONS'));
  assert.ok(!out('help').some(line => line.includes('cowsay')));
  assert.ok(out('help').some(line => line.includes('apt')));
});
