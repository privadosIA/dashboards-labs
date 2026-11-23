#!/usr/bin/env node
// Builds the examples site: each dashboard of deploy/examples/sections.json with its own `examples` configuration and the base
// address of its folder, into dist/examples/<path>/, and the static index page of deploy/web/examples/ at the root.
//
//   node scripts/build-examples.mjs [--only <path>]     (--only builds one section and leaves the rest of dist/examples as it is)
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'dist/examples';

/** The sections of the registry, kebab-case paths of one segment. */
export function readSections(file = join(root, 'deploy/examples/sections.json')) {
  const { sections } = JSON.parse(readFileSync(file, 'utf8'));
  for (const s of sections) if (!/^[a-z][a-z0-9-]*$/.test(s.path)) throw new Error(`section path "${s.path}" is not kebab-case`);
  return sections;
}

/** The `ng build` arguments of one section: its application, the `examples` configuration, and the folder it is served from. */
export function buildArgs(section, out = OUT) {
  return ['ng', 'build', section.project, '--configuration', 'examples', '--base-href', `/${section.path}/`, '--output-path', `${out}/${section.path}`];
}

/** The sections to build: all of them, or only the one asked for (an unknown one is an error). */
export function select(sections, only) {
  if (!only) return sections;
  const found = sections.filter((s) => s.path === only);
  if (found.length === 0) throw new Error(`no section "${only}" (${sections.map((s) => s.path).join(', ')})`);
  return found;
}

function main() {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined;
  const chosen = select(readSections(), only);
  const out = join(root, OUT);
  if (!only) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const s of chosen) {
    console.log(`== ${s.path} (${s.project})`);
    const r = spawnSync('npx', buildArgs(s, OUT), { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`the build of ${s.project} failed`);
    // The Angular builder puts the files in browser/; the folder served is that one.
    const dist = join(out, s.path, 'browser');
    if (existsSync(dist)) {
      cpSync(dist, join(out, `${s.path}.tmp`), { recursive: true });
      rmSync(join(out, s.path), { recursive: true, force: true });
      cpSync(join(out, `${s.path}.tmp`), join(out, s.path), { recursive: true });
      rmSync(join(out, `${s.path}.tmp`), { recursive: true, force: true });
    }
    if (!existsSync(join(out, s.path, 'index.html'))) throw new Error(`no index.html in ${OUT}/${s.path}`);
  }
  if (!only) cpSync(join(root, 'deploy/web/examples'), out, { recursive: true });
  console.log(`examples site in ${OUT}: ${chosen.map((s) => s.path).join(', ')}${only ? '' : ' + index'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
