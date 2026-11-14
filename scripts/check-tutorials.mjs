#!/usr/bin/env node
// Checks the tutorials of the standalone dashboards (docs/TUTORIAL.<video|music|animation|motion-edit|vector|dataset>[.es].md): both languages exist, every
// figure they use exists, each figure of one language has its twin in the other, both have the same number of headings, and the
// figures do not weigh more than a cap. It does not judge the prose.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const TUTORIALS = ['video', 'music', 'animation', 'motion-edit', 'vector', 'dataset'];
export const MAX_FIGURES_BYTES = 25 * 1024 * 1024;

const figures = (text) => [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((p) => p.startsWith('tutorial/'));
const headings = (text) => {
  let fenced = false;
  let n = 0;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (!fenced && /^#{1,6}\s/.test(line)) n++;
  }
  return n;
};
const folderSize = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? folderSize(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0) : 0);

/** What is wrong with the tutorials of a docs folder, as sentences; empty when they are fine. A tutorial that has neither language yet is not checked. */
export function checkTutorials(docs) {
  const problems = [];
  for (const key of TUTORIALS) {
    const files = { en: join(docs, `TUTORIAL.${key}.md`), es: join(docs, `TUTORIAL.${key}.es.md`) };
    const has = { en: existsSync(files.en), es: existsSync(files.es) };
    if (!has.en && !has.es) continue;
    if (!has.en || !has.es) {
      problems.push(`${key}: the ${has.en ? 'Spanish' : 'English'} tutorial is missing`);
      continue;
    }
    const text = { en: readFileSync(files.en, 'utf8'), es: readFileSync(files.es, 'utf8') };
    const used = { en: figures(text.en), es: figures(text.es) };
    for (const lang of ['en', 'es']) {
      for (const path of used[lang]) if (!existsSync(join(docs, path))) problems.push(`${key} (${lang}): the figure ${path} does not exist`);
    }
    const twin = (path) => path.replace(`tutorial/${key}/es/`, `tutorial/${key}/en/`);
    const spanishAsEnglish = used.es.map(twin);
    for (const path of used.en) if (!spanishAsEnglish.includes(path)) problems.push(`${key}: the English figure ${path} has no twin in the Spanish tutorial`);
    for (const path of spanishAsEnglish) if (!used.en.includes(path)) problems.push(`${key}: the Spanish tutorial has a figure whose English twin ${path} is not in the English one`);
    if (headings(text.en) !== headings(text.es)) problems.push(`${key}: the English tutorial has ${headings(text.en)} headings and the Spanish one ${headings(text.es)}`);
  }
  const weight = TUTORIALS.reduce((sum, key) => sum + folderSize(join(docs, 'tutorial', key)), 0);
  if (weight > MAX_FIGURES_BYTES) problems.push(`the figures weigh ${(weight / 1048576).toFixed(1)} MB and the cap is ${MAX_FIGURES_BYTES / 1048576} MB`);
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkTutorials(resolve(here, '../docs'));
  if (problems.length) {
    console.error(problems.map((p) => `check-tutorials: ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('check-tutorials: both languages of every tutorial have the same figures and headings, and every figure exists');
}
