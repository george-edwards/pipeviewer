import test from 'node:test';
import assert from 'node:assert/strict';
import { slides } from '../intro.js';
import { lessons } from '../lessons.js';

test('every n00b slide draws a picture with its own keyframes', () => {
  const names = slides.flatMap(slide => {
    const svg = slide.picture();
    assert.match(svg, /^<svg class="intro-picture"[^>]*>[\s\S]*<\/svg>$/, slide.title);
    for (const key of ['title', 'text']) assert.ok(slide[key], `${slide.title}: ${key}`);
    assert.ok(slide.example.command && slide.example.note, slide.title);
    return [...svg.matchAll(/@keyframes ([\w-]+)/g)].map(match => match[1]);
  });
  assert.equal(new Set(names).size, names.length);
});
test('only level 0 has the explainer', () => {
  assert.deepEqual(lessons.flatMap((lesson, i) => lesson.intro ? [i] : []), [0]);
});
