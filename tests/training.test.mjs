import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline } from '../parser.js';
import { compare, starsFor } from '../training.js';
import { lessons } from '../lessons.js';

const diff = (target, yours, platform = 'linux') => compare(parsePipeline(target, { platform }), parsePipeline(yours, { platform }));

test('spellings that draw the same picture match', () => {
  for (const spelling of ['sort <unsorted.txt >sorted.txt', 'sort 0< unsorted.txt 1> sorted.txt', '>sorted.txt sort <unsorted.txt', "sort <'unsorted.txt' >\"sorted.txt\""]) {
    assert.deepEqual(diff('sort <unsorted.txt >sorted.txt', spelling), [], spelling);
  }
});
test('a redirected stream is reported with both destinations', () => {
  const [difference, ...rest] = diff('sort unsorted.txt >sorted.txt', 'sort unsorted.txt');
  assert.equal(rest.length, 0);
  assert.equal(difference.kind, 'stream');
  assert.equal(difference.fd, 1);
  assert.equal(difference.key, '1');
  assert.equal(difference.target, 'sorted.txt (overwrite)');
  assert.equal(difference.yours, 'the terminal');
});
test('a file argument and a stdin redirect draw different pictures', () => {
  const differences = diff('sort <unsorted.txt >sorted.txt', 'sort unsorted.txt >sorted.txt');
  assert.deepEqual(differences.map(d => d.kind), ['command', 'stream']);
  assert.equal(differences[1].fd, 0);
  assert.equal(differences[1].target, 'unsorted.txt');
});
test('appending is not overwriting', () => {
  assert.equal(diff('sort a >b', 'sort a >>b')[0].yours, 'b (append)');
});
test('a different number of commands is reported once', () => {
  const differences = diff('sort <unsorted.txt >sorted.txt', 'cat unsorted.txt | sort >sorted.txt');
  assert.equal(differences.length, 1);
  assert.equal(differences[0].kind, 'shape');
  assert.match(differences[0].text, /1 command joined by pipes; yours has 2/);
});
test('every level starts away from its target, and its target parses on both systems', () => {
  lessons.forEach((lesson, i) => {
    const start = lesson.start ?? lessons[i - 1].target;
    for (const platform of ['linux', 'macos']) assert.notDeepEqual(diff(lesson.target, start, platform), [], lesson.id);
  });
  assert.equal(new Set(lessons.map(lesson => lesson.id)).size, lessons.length);
});
test('each hint costs a star, down to one', () => {
  assert.deepEqual([0, 1, 2, 3].map(starsFor), [3, 2, 1, 1]);
});
