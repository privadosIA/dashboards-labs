import assert from 'node:assert/strict';
import { test } from 'node:test';

import { overall, RUNS, runAll } from './test-coverage.mjs';

test('a failing first run does not stop the second, and the whole fails', () => {
  const ran = [];
  const statuses = runAll(RUNS, (command, args) => {
    ran.push(args[0]);
    return { status: ran.length === 1 ? 1 : 0 };
  });
  assert.equal(ran.length, RUNS.length);
  assert.deepEqual(statuses, [1, 0]);
  assert.equal(overall(statuses), 1);
});

test('a run killed by a signal (no status) counts as failed', () => {
  assert.deepEqual(runAll(RUNS, () => ({ status: null })), [1, 1]);
});

test('the whole passes only when every run passes', () => {
  assert.equal(overall([0, 0]), 0);
  assert.equal(overall([0, 2]), 1);
});

test('both runs write what Sonar reads: lcov under coverage/', () => {
  const node = RUNS[0].args;
  assert.ok(node.includes('--test-reporter-destination=coverage/lcov.info'));
  assert.deepEqual(RUNS[1].args.slice(0, 4), ['ng', 'test', '--no-watch', '--coverage']);
});
