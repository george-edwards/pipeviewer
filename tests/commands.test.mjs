import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import commands from '../commands/index.js';

test('every command file follows the rule interface and is registered once', async () => {
  const files = readdirSync(new URL('../commands/', import.meta.url)).filter(file => !['index.js', 'helpers.js'].includes(file));
  const registered = new Set(commands);
  for (const file of files) {
    const { default: rule } = await import(`../commands/${file}`);
    assert.ok(registered.has(rule), `${file} is not listed in commands/index.js`);
    assert.ok(Array.isArray(rule.names) && rule.names.length && rule.names.every(name => typeof name === 'string' && name), `${file} needs a names array`);
    assert.equal(typeof rule.infer, 'function', `${file} needs an infer function`);
  }
  assert.equal(commands.length, files.length);
  const names = commands.flatMap(rule => rule.names);
  assert.deepEqual(names.filter((name, i) => names.indexOf(name) !== i), [], 'each name belongs to one rule');
});
