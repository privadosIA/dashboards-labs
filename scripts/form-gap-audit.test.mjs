import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judgeGaps, pairGaps } from './form-gap-audit.mjs';

const box = (id, x, y, width = 200, height = 40) => ({ id, x, y, width, height });

test('measures the gap of a field to the one stacked under it', () => {
  const pairs = pairGaps([box('provider', 0, 0), box('model', 0, 49)]);
  assert.deepEqual(pairs, [{ a: 'provider', b: 'model', direction: 'below', gap: 9, measured: true, sameSpan: true }]);
});

test('measures fields side by side', () => {
  const pairs = pairGaps([box('a', 0, 0, 100), box('b', 116, 0, 100)]);
  assert.deepEqual(pairs, [{ a: 'a', b: 'b', direction: 'beside', gap: 16, measured: true, sameSpan: true }]);
});

test('takes only the nearest neighbour in each direction', () => {
  const pairs = pairGaps([box('a', 0, 0), box('b', 0, 56), box('c', 0, 112)]);
  assert.deepEqual(pairs.map((p) => `${p.a}>${p.b}:${p.gap}`).sort(), ['a>b:16', 'b>c:16']);
});

test('a row that wraps measures the row below against the column it shares', () => {
  // a b on the first row, c under a, d under b
  const pairs = pairGaps([box('a', 0, 0, 100), box('b', 116, 0, 100), box('c', 0, 56, 100), box('d', 116, 56, 100)]);
  const keys = pairs.map((p) => `${p.a}>${p.b}:${p.direction}:${p.gap}`).sort();
  assert.deepEqual(keys, ['a>b:beside:16', 'a>c:below:16', 'b>d:below:16', 'c>d:beside:16']);
});

test('a wide field under two narrow ones is measured against the nearest', () => {
  const pairs = pairGaps([box('a', 0, 0, 100), box('b', 116, 0, 100), box('wide', 0, 56, 216)]);
  assert.deepEqual(pairs.filter((p) => p.direction === 'below').map((p) => `${p.a}>${p.b}:${p.gap}`).sort(), ['a>wide:16', 'b>wide:16']);
});

test('one field has no pair', () => {
  assert.deepEqual(pairGaps([box('only', 0, 0)]), []);
  assert.deepEqual(pairGaps([]), []);
});

test('overlapping boxes give a negative gap', () => {
  const [pair] = pairGaps([box('a', 0, 0), box('b', 0, 30)]);
  assert.equal(pair.gap, -10);
});

test('a message counted in the box of its field moves the gap to the message', () => {
  // the field is 40 tall and its message ends at 62; the next one starts 16 below that
  const pairs = pairGaps([box('amount', 0, 0, 200, 62), box('next', 0, 78)]);
  assert.equal(pairs[0].gap, 16);
});

test('judges a gap below the field gap, naming both fields', () => {
  const problems = judgeGaps([{ a: 'provider', b: 'model', direction: 'below', gap: 9 }], 16);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /provider and model \(below\) are 9px apart: closer than the field gap of 16px/);
});

test('judges a gap more than a couple of pixels above the field gap as loose', () => {
  const problems = judgeGaps([{ a: 'a', b: 'b', direction: 'below', gap: 24 }], 16);
  assert.match(problems[0], /more than the field gap of 16px \(another margin adds to it\)/);
});

test('lets a gap equal to the field gap, or a pixel or two over, pass', () => {
  assert.deepEqual(judgeGaps([{ a: 'a', b: 'b', direction: 'below', gap: 16 }, { a: 'b', b: 'c', direction: 'beside', gap: 17.5 }], 16), []);
  assert.deepEqual(judgeGaps([{ a: 'a', b: 'b', direction: 'below', gap: 15.6 }], 16), []);
});

test('a wide field under two narrow ones is not in the same column as either', () => {
  const pairs = pairGaps([box('a', 0, 0, 100), box('b', 116, 0, 100), box('wide', 0, 56, 216)]);
  assert.deepEqual(pairs.filter((p) => p.direction === 'below').map((p) => p.sameSpan), [false, false]);
});

test('a block that is not a field stays between the fields and is not judged', () => {
  const rects = [box('a', 0, 0), { ...box('chips', 0, 40), kind: 'other' }, box('b', 0, 120)];
  const pairs = pairGaps(rects);
  // a is measured against the block, never against b across it
  assert.deepEqual(pairs.map((p) => `${p.a}>${p.b}:${p.measured}`).sort(), ['a>chips:false', 'chips>b:false']);
  assert.deepEqual(judgeGaps(pairs, 16), []);
});

test('a hole in the grid beside a field is not judged as a loose gap, a tight one still is', () => {
  const loose = [{ a: 'light', b: 'typeface', direction: 'below', gap: 53, measured: true, sameSpan: false }];
  assert.deepEqual(judgeGaps(loose, 16), []);
  const tight = [{ a: 'light', b: 'typeface', direction: 'below', gap: 4, measured: true, sameSpan: false }];
  assert.equal(judgeGaps(tight, 16).length, 1);
});
