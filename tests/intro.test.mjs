import test from 'node:test';
import assert from 'node:assert/strict';
import { slides } from '../intro.js';
import { lessons } from '../lessons.js';

test('every n00b slide draws a picture with its own keyframes, or holds a film', () => {
  const names = slides.flatMap(slide => {
    for (const key of ['title', 'text']) assert.ok(slide[key], `${slide.title}: ${key}`);
    if (slide.video) {
      assert.ok(slide.video.id && slide.video.start >= 0 && slide.video.label.length === 2, slide.title);
      return [];
    }
    const svg = slide.picture();
    assert.match(svg, /^<svg class="intro-picture"[^>]*>[\s\S]*<\/svg>$/, slide.title);
    assert.ok(slide.example.command && slide.example.note, slide.title);
    return [...svg.matchAll(/@keyframes ([\w-]+)/g)].map(match => match[1]);
  });
  assert.equal(new Set(names).size, names.length);
});
test('only level 0 has the explainer', () => {
  assert.deepEqual(lessons.flatMap((lesson, i) => lesson.intro ? [i] : []), [0]);
});
