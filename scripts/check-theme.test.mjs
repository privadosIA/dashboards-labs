import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkFieldGap, checkLibraryStyles, checkTheme, dashboardSources, libraryTemplateSources, librarySources, templateProblems } from './check-theme.mjs';

const PINNED = (light, dark) => `\n:root[data-theme='dark'] {\n  color-scheme: dark;\n${dark}\n}\n\n:root[data-theme='light'] {\n  color-scheme: light;\n${light}\n}\n`;
const TOKENS = (light, dark, pinned = PINNED(light, dark)) => `:root {\n${light}\n}\n\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n${dark}\n  }\n}\n${pinned}`;
const GOOD = TOKENS('  --lab-bg: #fff;\n  --lab-ink: #111;\n  --lab-radius: 8px;', '    --lab-bg: #000;\n    --lab-ink: #eee;');

function dashboard(files) {
  const src = mkdtempSync(join(tmpdir(), 'theme-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(src, file)), { recursive: true });
    writeFileSync(join(src, file), text);
  }
  return src;
}

test('the tokens of every dashboard and of the template are complete', () => {
  const sources = dashboardSources();
  assert.ok(sources.length >= 1, 'expected at least the full dashboard');
  const problems = sources.flatMap((src) => checkTheme(src));
  assert.deepEqual(problems, []);
});

test('passes when every colour token has both values and every used token is defined', () => {
  const src = dashboard({ 'theme/_tokens.scss': GOOD, 'app/a.scss': 'p { color: var(--lab-ink); border-radius: var(--lab-radius); }' });
  assert.deepEqual(checkTheme(src), []);
});

test('fails when a colour token has no dark value, naming the token', () => {
  const src = dashboard({ 'theme/_tokens.scss': TOKENS('  --lab-bg: #fff;\n  --lab-ink: #111;', '    --lab-bg: #000;') });
  const problems = checkTheme(src);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /--lab-ink is a colour and has no dark value/);
});

test('lets a token that is not a colour stay the same in both schemes', () => {
  const src = dashboard({ 'theme/_tokens.scss': TOKENS('  --lab-radius: 8px;', '') });
  assert.deepEqual(checkTheme(src), []);
});

test('fails when a stylesheet uses a token that is not defined, naming the file', () => {
  const src = dashboard({ 'theme/_tokens.scss': GOOD, 'app/page.scss': 'p { color: var(--lab-missing); }' });
  const problems = checkTheme(src);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /page\.scss: uses --lab-missing/);
});

test('fails when a component stylesheet holds a colour literal, naming the file', () => {
  const src = dashboard({ 'theme/_tokens.scss': GOOD, 'app/a.scss': 'p { background: #000; }', 'app/b.scss': 'p { box-shadow: 0 0 4px rgb(0 0 0 / 0.5); }' });
  const problems = checkTheme(src);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /a\.scss: has a colour literal/);
  assert.match(problems[1], /b\.scss: has a colour literal/);
});

test('lets comments and the theme folder mention colours', () => {
  const src = dashboard({
    'theme/_tokens.scss': GOOD,
    'theme/_material.scss': 'html { --mat-x: #123456; }',
    'app/a.scss': '// the old #000 and rgb(0 0 0) are gone\n/* #fff */\np { color: var(--lab-ink); }',
  });
  assert.deepEqual(checkTheme(src), []);
});

test('fails when there is no dark block, or a dark value with no light one', () => {
  assert.match(checkTheme(dashboard({ 'theme/_tokens.scss': ':root { --lab-bg: #fff; }' })).join('\n'), /no dark block/);
  const extra = dashboard({ 'theme/_tokens.scss': TOKENS('  --lab-bg: #fff;', '    --lab-bg: #000;\n    --lab-extra: #333;') });
  assert.match(checkTheme(extra).join('\n'), /--lab-extra has a dark value and no light value/);
});

test('fails when a dashboard has no tokens file', () => {
  assert.match(checkTheme(dashboard({ 'app/a.scss': 'p {}' })).join('\n'), /no tokens file/);
});

test('the libraries draw only with tokens every dashboard defines', () => {
  const libraries = librarySources();
  assert.ok(libraries.length >= 1, 'expected @lab/server-connection');
  assert.deepEqual(libraries.flatMap((src) => checkLibraryStyles(src, dashboardSources())), []);
});

test('a library with a colour literal, or a token a dashboard does not define, fails naming the file', () => {
  const dashboardA = dashboard({ 'theme/_tokens.scss': GOOD });
  const dashboardB = dashboard({ 'theme/_tokens.scss': TOKENS('  --lab-bg: #fff;', '    --lab-bg: #000;') });
  const library = dashboard({ 'a/ok.scss': 'p { color: var(--lab-bg); }', 'a/literal.scss': 'p { color: #fff; }', 'a/rgb.scss': 'p { color: rgb(1, 2, 3); }', 'a/token.scss': 'p { color: var(--lab-ink); }' });
  const problems = checkLibraryStyles(library, [dashboardA, dashboardB]).join('\n');
  assert.match(problems, /literal\.scss: has a colour literal/);
  assert.match(problems, /rgb\.scss: has a colour literal/);
  assert.match(problems, /token\.scss: uses --lab-ink, which .*does not define/);
  assert.doesNotMatch(problems, /ok\.scss/);
});

test('fails when a pinned block is missing, naming which', () => {
  const noDark = dashboard({ 'theme/_tokens.scss': TOKENS('  --lab-bg: #fff;', '    --lab-bg: #000;', "\n:root[data-theme='light'] {\n  color-scheme: light;\n  --lab-bg: #fff;\n}\n") });
  assert.match(checkTheme(noDark).join('\n'), /no pinned dark block/);
  const none = dashboard({ 'theme/_tokens.scss': TOKENS('  --lab-bg: #fff;', '    --lab-bg: #000;', '') });
  const problems = checkTheme(none).join('\n');
  assert.match(problems, /no pinned light block/);
  assert.match(problems, /no pinned dark block/);
});

test('fails when a pinned value differs from the light or the dark one, naming the token and both values', () => {
  const light = '  --lab-bg: #fff;\n  --lab-ink: #111;';
  const dark = '    --lab-bg: #000;\n    --lab-ink: #eee;';
  const drift = dashboard({ 'theme/_tokens.scss': TOKENS(light, dark, PINNED('  --lab-bg: #fff;\n  --lab-ink: #222;', '    --lab-bg: #000;\n    --lab-ink: #eee;')) });
  assert.match(checkTheme(drift).join('\n'), /--lab-ink is #222 in the pinned light block and #111 in the light values/);
  const missing = dashboard({ 'theme/_tokens.scss': TOKENS(light, dark, PINNED('  --lab-bg: #fff;\n  --lab-ink: #111;', '    --lab-bg: #000;')) });
  assert.match(checkTheme(missing).join('\n'), /--lab-ink is missing from the pinned dark block/);
});

test('fails when a pinned block does not set the matching color-scheme', () => {
  const pinned = ":root[data-theme='dark'] {\n  --lab-bg: #000;\n}\n:root[data-theme='light'] {\n  color-scheme: light;\n  --lab-bg: #fff;\n}\n";
  const src = dashboard({ 'theme/_tokens.scss': TOKENS('  --lab-bg: #fff;', '    --lab-bg: #000;', pinned) });
  assert.match(checkTheme(src).join('\n'), /pinned dark block does not set color-scheme: dark/);
});

test('the templates of every library draw with no colour of their own', () => {
  const sources = libraryTemplateSources();
  assert.ok(sources.length >= 5, 'expected the libraries of the workspace');
  assert.deepEqual(sources.flatMap((src) => templateProblems(src)), []);
});

test('passes a template that uses only token utilities and layout utilities', () => {
  const src = dashboard({ 'theme/_tokens.scss': GOOD, 'app/a.html': '<div class="flex gap-3 bg-lab-surface text-lab-ink border border-lab-line ease-lab hover:-translate-y-0.5 active:scale-[0.98] w-[18rem]">x</div>' });
  assert.deepEqual(checkTheme(src), []);
});

test('fails a template with an arbitrary colour in a class, naming the file', () => {
  const src = dashboard({ 'theme/_tokens.scss': GOOD, 'app/a.html': '<div class="bg-[#fff]"></div>', 'app/b.html': '<div class="text-[rgb(0,0,0)]"></div>' });
  const problems = checkTheme(src);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /a\.html: has an arbitrary colour/);
  assert.match(problems[1], /b\.html: has an arbitrary colour/);
});

test('fails a template with a class of the default palette, with a variant or an opacity too', () => {
  const src = dashboard({
    'theme/_tokens.scss': GOOD,
    'app/a.html': '<div class="bg-zinc-200"></div>',
    'app/b.html': '<div class="hover:border-blue-600/50"></div>',
    'app/c.html': '<div class="text-white"></div>',
  });
  const problems = checkTheme(src);
  assert.equal(problems.length, 3);
  for (const [i, name] of ['a', 'b', 'c'].entries()) assert.match(problems[i], new RegExp(`${name}\\.html: has a class of Tailwind's default palette`));
});

test('fails a template with a dark: variant, naming the file', () => {
  const src = dashboard({ 'theme/_tokens.scss': GOOD, 'app/a.html': '<div class="bg-lab-surface dark:bg-lab-bg"></div>' });
  const problems = checkTheme(src);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /a\.html: has a dark: variant/);
});

test('lets an HTML comment, a longer class name and prose such as "dark: theme" be', () => {
  const src = dashboard({ 'theme/_tokens.scss': GOOD, 'app/a.html': '<!-- bg-zinc-200 dark:bg-black bg-[#fff] -->\n<p>The dark: theme</p><div class="text-whitespace bg-lab-bg"></div>' });
  assert.deepEqual(templateProblems(join(src, 'app')), []);
});

test('passes a bridge that only maps defined tokens', () => {
  const src = dashboard({ 'theme/_tokens.scss': GOOD, 'tailwind.css': '/* the bridge #fff in a comment */\n@theme inline {\n  --color-*: initial;\n  --color-lab-bg: var(--lab-bg);\n  --radius-lab: var(--lab-radius);\n}' });
  assert.deepEqual(checkTheme(src), []);
});

test('fails a bridge with a colour literal or a token the dashboard does not define', () => {
  const src = dashboard({ 'theme/_tokens.scss': GOOD, 'tailwind.css': '@theme inline {\n  --color-lab-bg: #fff;\n  --color-lab-x: var(--lab-missing);\n}' });
  const problems = checkTheme(src);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /tailwind\.css: has a colour literal/);
  assert.match(problems[1], /tailwind\.css: maps --lab-missing/);
});

const GAP_TOKENS = (declarations) => dashboard({ 'theme/_tokens.scss': `:root {\n${declarations}\n}\n` });

test('every dashboard and the template define a field gap of at least --lab-space-3', () => {
  const sources = dashboardSources();
  assert.ok(sources.length >= 1);
  assert.deepEqual(sources.flatMap((src) => checkFieldGap(src)), []);
});

test('passes a field gap equal to, larger than, or through var() of --lab-space-3', () => {
  assert.deepEqual(checkFieldGap(GAP_TOKENS('  --lab-space-3: 1rem;\n  --lab-field-gap: var(--lab-space-3);')), []);
  assert.deepEqual(checkFieldGap(GAP_TOKENS('  --lab-space-3: 1rem;\n  --lab-field-gap: 1rem;')), []);
  assert.deepEqual(checkFieldGap(GAP_TOKENS('  --lab-space-3: 12px;\n  --lab-field-gap: 16px;')), []);
  assert.deepEqual(checkFieldGap(GAP_TOKENS('  --lab-space-3: 12px;\n  --lab-space-4: 16px;\n  --lab-field-gap: var(--lab-space-4);')), []);
});

test('compares rem with px at 16px, in either order', () => {
  assert.deepEqual(checkFieldGap(GAP_TOKENS('  --lab-space-3: 12px;\n  --lab-field-gap: 0.75rem;')), []);
  assert.equal(checkFieldGap(GAP_TOKENS('  --lab-space-3: 1rem;\n  --lab-field-gap: 12px;')).length, 1);
});

test('fails a missing field gap, naming the tokens file', () => {
  const problems = checkFieldGap(GAP_TOKENS('  --lab-space-3: 1rem;'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /_tokens\.scss: has no --lab-field-gap/);
});

test('fails a field gap smaller than --lab-space-3, even through var()', () => {
  const small = checkFieldGap(GAP_TOKENS('  --lab-space-3: 1rem;\n  --lab-field-gap: 8px;'));
  assert.match(small[0], /--lab-field-gap \(8px\) is smaller than --lab-space-3 \(16px\)/);
  const viaVar = checkFieldGap(GAP_TOKENS('  --lab-space-2: 0.5rem;\n  --lab-space-3: 1rem;\n  --lab-field-gap: var(--lab-space-2);'));
  assert.match(viaVar[0], /is smaller than/);
});

test('fails a field gap that is not a length, or a loop of var()', () => {
  assert.match(checkFieldGap(GAP_TOKENS('  --lab-space-3: 1rem;\n  --lab-field-gap: calc(1rem + 2px);'))[0], /must be lengths/);
  assert.match(checkFieldGap(GAP_TOKENS('  --lab-space-3: 1rem;\n  --lab-field-gap: var(--lab-field-gap);'))[0], /must be lengths/);
});
