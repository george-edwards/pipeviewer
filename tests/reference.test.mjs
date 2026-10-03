import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePipeline } from '../parser.js';
import { reference } from '../reference.js';

test('every reference entry explains more with an example that draws on both systems', () => {
  for (const entry of reference) {
    assert.ok(entry.syntax && entry.summary, entry.syntax);
    const examples = entry.more.split(/\n{2,}/).filter(block => block.startsWith('```')).map(block => block.replace(/^```\n?|\n?```$/g, ''));
    assert.ok(examples.length, `${entry.syntax} has no example`);
    for (const source of examples) for (const platform of ['linux', 'macos']) assert.doesNotThrow(() => parsePipeline(source, { platform }), `${source} (${platform})`);
  }
});
