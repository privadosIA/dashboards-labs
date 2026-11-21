import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBuildOutput } from './check-build-output.mjs';

const NAV = [{ positive: false, regex: '^\\/(?:.+\\/)?[^/]*\\.[^/]*$' }];
function build(extra = {}, ngsw = { assetGroups: [{ resources: { files: ['/index.html', '/*.js'] } }], navigationUrls: NAV }) {
  const dir = mkdtempSync(join(tmpdir(), 'build-output-'));
  for (const f of ['index.html', 'obras.html', 'obras.css', 'obras.js']) writeFileSync(join(dir, f), '');
  writeFileSync(join(dir, 'ngsw.json'), JSON.stringify(ngsw));
  for (const [name, text] of Object.entries(extra)) {
    if (text === null) writeFileSync(join(dir, name), '');
    else writeFileSync(join(dir, name), text);
  }
  return dir;
}

test('a good build has no problems', () => {
  assert.deepEqual(checkBuildOutput(build()), []);
});

test('says what is missing: the page files and the browser output itself', () => {
  const dir = build();
  assert.match(checkBuildOutput(join(dir, 'nowhere')).join('\n'), /no index\.html/);
  const empty = mkdtempSync(join(tmpdir(), 'build-output-'));
  writeFileSync(join(empty, 'index.html'), '');
  assert.equal(checkBuildOutput(empty).filter((p) => /missing at the root/.test(p)).length, 3);
});

test('finds a private address and a written-out bearer token', () => {
  const dir = build({ 'main.js': 'fetch("http://100.64.0.1:4666/api")', 'x.js': 'h="Bearer abcdefghijklmnopqrstuvwxyz0123"', 'ok.js': 'h = "Bearer " + token' });
  const problems = checkBuildOutput(dir).join('\n');
  assert.match(problems, /main\.js: a private network address/);
  assert.match(problems, /x\.js: it holds a literal bearer token/);
  assert.doesNotMatch(problems, /ok\.js/);
});

test('the worker must not cache the page nor rewrite its navigation', () => {
  const caches = build({}, { assetGroups: [{ resources: { files: ['/obras.html'] } }], navigationUrls: NAV });
  assert.match(checkBuildOutput(caches).join('\n'), /caches obras\.html/);
  const rewrites = build({}, { assetGroups: [], navigationUrls: [{ positive: true, regex: '^\\/.*$' }] });
  assert.match(checkBuildOutput(rewrites).join('\n'), /does not exclude paths with a dot/);
});
