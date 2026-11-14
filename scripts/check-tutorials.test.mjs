import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTutorials, MAX_FIGURES_BYTES } from './check-tutorials.mjs';

const docs = () => mkdtempSync(join(tmpdir(), 'tutorials-'));
const write = (d, rel, content) => {
  const p = join(d, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
};
const page = (lang, key, names, extra = '') => `# Title\n\n## One\n\n${names.map((n) => `![x](tutorial/${key}/${lang}/${n}.png)`).join('\n\n')}\n${extra}`;
function pair(d, key, en, es) {
  write(d, `TUTORIAL.${key}.md`, page('en', key, en));
  write(d, `TUTORIAL.${key}.es.md`, page('es', key, es));
  for (const n of new Set([...en, ...es])) for (const lang of ['en', 'es']) write(d, `tutorial/${key}/${lang}/${n}.png`, 'x');
}

test('nothing to check while no tutorial is written', () => {
  assert.deepEqual(checkTutorials(docs()), []);
});

test('both languages with the same figures and headings pass', () => {
  const d = docs();
  pair(d, 'animation', ['01-a', '02-b'], ['01-a', '02-b']);
  assert.deepEqual(checkTutorials(d), []);
});

test('a tutorial in one language only is reported', () => {
  const d = docs();
  write(d, 'TUTORIAL.music.md', '# x\n');
  assert.deepEqual(checkTutorials(d), ['music: the Spanish tutorial is missing']);
});

test('a figure that does not exist is reported with its language', () => {
  const d = docs();
  pair(d, 'video', ['01-a'], ['01-a']);
  write(d, 'TUTORIAL.video.md', page('en', 'video', ['01-a', '02-gone']));
  const problems = checkTutorials(d);
  assert.ok(problems.includes('video (en): the figure tutorial/video/en/02-gone.png does not exist'));
});

test('a figure with no twin in the other language is reported naming it', () => {
  const d = docs();
  pair(d, 'animation', ['01-a', '02-b'], ['01-a']);
  const problems = checkTutorials(d);
  assert.ok(problems.includes('animation: the English figure tutorial/animation/en/02-b.png has no twin in the Spanish tutorial'));
});

test('a different number of headings is reported, and a heading inside a code block is not one', () => {
  const d = docs();
  pair(d, 'animation', ['01-a'], ['01-a']);
  write(d, 'TUTORIAL.animation.md', page('en', 'animation', ['01-a'], '\n## Two\n'));
  assert.deepEqual(checkTutorials(d), ['animation: the English tutorial has 3 headings and the Spanish one 2']);
  write(d, 'TUTORIAL.animation.md', page('en', 'animation', ['01-a'], '\n```\n# not a heading\n```\n'));
  assert.deepEqual(checkTutorials(d), []);
});

test('figures heavier than the cap are reported', () => {
  const d = docs();
  pair(d, 'animation', ['01-a'], ['01-a']);
  write(d, 'tutorial/animation/en/01-a.png', Buffer.alloc(MAX_FIGURES_BYTES + 1));
  assert.match(checkTutorials(d)[0], /the figures weigh .* MB and the cap is 25 MB/);
});
