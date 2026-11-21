import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

// Compiles each dashboard's Tailwind bridge (apps/<name>/src/tailwind.css) against a fixture template and checks what comes out:
// token utilities read the dashboard's own tokens, Tailwind's default palette draws nothing, and its reset is not loaded.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Inside the repository, so that `tailwindcss/...` resolves from node_modules; the folder is ignored by git.
const work = join(root, 'node_modules/.cache/lab-tailwind-bridge');
mkdirSync(work, { recursive: true });

// The generator's template carries one too (its `__NAME__` is only in a comment), so a new dashboard is born with it.
const bridges = [
  ...readdirSync(join(root, 'apps')).map((name) => ({ name, file: join(root, 'apps', name, 'src/tailwind.css') })),
  { name: 'template', file: join(root, 'templates/dashboard/src/tailwind.css') },
].filter(({ file }) => existsSync(file));

/** The bridge with its `@source` lines replaced by the fixture, compiled with `classes` in a template. */
async function compile(file, classes) {
  const dir = mkdtempSync(join(work, 'run-'));
  writeFileSync(join(dir, 'fixture.html'), `<div class="${classes.join(' ')}"></div>`);
  const css = readFileSync(file, 'utf8').replace(/^@source .*$/gm, '').replace('@theme inline', "@source './fixture.html';\n@theme inline");
  const out = await postcss([tailwind({ base: dir })]).process(css, { from: join(dir, 'bridge.css') });
  return out.css;
}

test('every dashboard of the workspace has a bridge', () => {
  // Every app of the checkout has one, and so does the generator's template where there is one (the public edition has no generator).
  const apps = readdirSync(join(root, 'apps')).sort();
  assert.deepEqual(bridges.map((b) => b.name).filter((n) => n !== 'template').sort(), apps);
  assert.equal(bridges.some((b) => b.name === 'template'), existsSync(join(root, 'templates/dashboard/src/tailwind.css')));
});

for (const { name, file } of bridges) {
  const text = readFileSync(file, 'utf8');
  const colours = [...text.matchAll(/--color-lab-([\w-]+):\s*var\((--lab-[\w-]+)\)/g)].map((m) => ({ utility: m[1], token: m[2] }));

  test(`${name}: a token utility reads the token and does not copy its value`, async () => {
    assert.ok(colours.length >= 10, 'expected the colour tokens of the dashboard');
    const css = await compile(file, colours.map((c) => `bg-lab-${c.utility}`));
    for (const { utility, token } of colours) {
      assert.match(css, new RegExp(`\\.bg-lab-${utility}\\s*{[^}]*background-color:\\s*var\\(${token}\\)`), `bg-lab-${utility} should read ${token}`);
    }
    assert.doesNotMatch(css, /background-color:\s*(#|rgb)/, 'no colour value is copied');
  });

  test(`${name}: spacing, shape, type and easing come from the dashboard's tokens`, async () => {
    const css = await compile(file, ['p-4', 'rounded-lab', 'font-sans', 'ease-lab']);
    assert.match(css, /\.p-4\s*{[^}]*padding:\s*calc\(var\(--lab-space-1\) \* 4\)/);
    assert.match(css, /\.rounded-lab\s*{[^}]*border-radius:\s*var\(--lab-radius\)/);
    assert.match(css, /\.font-sans\s*{[^}]*font-family:\s*var\(--lab-font\)/);
    assert.match(css, /cubic-bezier\(0?\.16,\s*1,\s*0?\.3,\s*1\)/);
  });

  test(`${name}: a class of the default palette draws nothing and the reset is not loaded`, async () => {
    const css = await compile(file, ['bg-zinc-200', 'text-white', 'border-blue-600', 'shadow-md', 'text-sm', 'rounded-lg', 'bg-lab-bg']);
    for (const gone of ['bg-zinc-200', 'text-white', 'border-blue-600', 'shadow-md', 'text-sm', 'rounded-lg']) {
      assert.doesNotMatch(css, new RegExp(`\\.${gone}\\b`), `${gone} should not produce a style`);
    }
    assert.match(css, /\.bg-lab-bg\b/);
    assert.doesNotMatch(css, /box-sizing|-webkit-text-size-adjust|::placeholder/, 'preflight should not be loaded');
  });
}

// dashboard-full draws its headings in a display face of its own (`--lab-font-display`).
test('dashboard-full: font-display reads the display face', async () => {
  const bridge = bridges.find((x) => x.name === 'dashboard-full');
  const css = await compile(bridge.file, ['font-display', 'font-sans']);
  assert.match(css, /\.font-display\s*{[^}]*font-family:\s*var\(--lab-font-display\)/);
  assert.match(css, /\.font-sans\s*{[^}]*font-family:\s*var\(--lab-font\)/);
});

