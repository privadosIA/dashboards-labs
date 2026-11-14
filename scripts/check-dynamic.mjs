#!/usr/bin/env node
// Checks the JSON schemas of every `dynamic/` folder under apps/ and libs/: each one exists in both languages (es and en,
// named <name>.<lang>.json) and both files describe the same fields.
//
//   node scripts/check-dynamic.mjs [ROOT]      (ROOT defaults to the apps/ and libs/ folders of the repository)
//
// Exits 1, one line per problem naming the file and the field, when something is out of step.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANGS = ['es', 'en'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** The keys a schema defines: fields, groups (by id), lists and the columns of tables, at any depth. */
export function fieldKeys(schema) {
  const keys = new Set();
  const visit = (node, path) => {
    if (!node || typeof node !== 'object') return;
    const id = node.key ?? node.id;
    const here = id ? `${path}${path ? '.' : ''}${id}` : path;
    if (id) keys.add(here);
    // `fields` and `columns` are lists in a group or a table; `columns` is also a number in a layout.
    for (const child of Array.isArray(node.fields) ? node.fields : []) visit(child, here);
    for (const column of Array.isArray(node.columns) ? node.columns : []) if (column?.key) keys.add(`${here}#${column.key}`);
  };
  for (const field of schema.fields ?? []) visit(field, '');
  return keys;
}

export function checkDynamic(root, shown = (p) => relative(process.cwd(), p) || p) {
  const problems = [];
  const groups = new Map(); // folder/name -> { lang -> file }
  for (const file of walk(root)) {
    if (basename(dirname(file)) !== 'dynamic' || !file.endsWith('.json')) continue;
    const m = /^(.+)\.([a-z]{2})\.json$/.exec(basename(file));
    if (!m || !LANGS.includes(m[2])) {
      problems.push(`${shown(file)}: the name must be <name>.<lang>.json with lang ${LANGS.join(' or ')}`);
      continue;
    }
    const id = join(dirname(file), m[1]);
    groups.set(id, { ...groups.get(id), [m[2]]: file });
  }
  for (const [id, files] of groups) {
    const loaded = {};
    for (const lang of LANGS) {
      if (!files[lang]) {
        const other = files[LANGS.find((l) => files[l])];
        problems.push(`${shown(`${id}.${lang}.json`)}: missing (${shown(other)} exists)`);
        continue;
      }
      try {
        loaded[lang] = fieldKeys(JSON.parse(readFileSync(files[lang], 'utf8')));
      } catch (e) {
        problems.push(`${shown(files[lang])}: cannot read it as JSON (${e.message})`);
      }
    }
    if (loaded.es && loaded.en) {
      for (const [from, to] of [['es', 'en'], ['en', 'es']]) {
        for (const key of loaded[from]) {
          if (!loaded[to].has(key)) problems.push(`${shown(files[to])}: has no field "${key}", which ${shown(files[from])} has`);
        }
      }
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const roots = process.argv[2] ? [resolve(process.argv[2])] : [resolve(here, '../apps'), resolve(here, '../libs')];
  const problems = roots.flatMap((root) => checkDynamic(root));
  if (problems.length) {
    for (const p of problems) console.error(`check-dynamic: ${p}`);
    process.exit(1);
  }
  console.log('check-dynamic: every dynamic/ folder has both languages with the same fields');
}
