import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parseTemplate, TmplAstText } from '@angular/compiler';

/** Attributes that carry text a person reads; each needs its `i18n-<name>` twin. */
const TEXT_ATTRS = new Set([
  'placeholder', 'aria-label', 'title', 'matTooltip', 'label', 'heading', 'description',
  'message', 'hint', 'alt', 'text', 'tooltip', 'empty', 'caption',
]);

/** Text that is not a sentence to translate: names, units, symbols. */
const ALLOWED = new Set(['GPU', 'API', 'LUFS', 'BPM', 'mediaOrquestator', 'Piper', 'Ollama', 'Whisper', 'SQLite', 'MySQL', 'Postgres', 'LAION-CLAP', 'MuQ', 'MuQ-MuLan', 'Wan', 'Krea', 'LoRA', 'ffmpeg', 'sd', 'seed', 'video', 'images', 'music', 'run', 'tts', 'English', 'Español', 'Steps', 'steps', 'variants', 'lora', 'VAE', 'Sampler', 'FPS', 'AnimateDiff', 'strength', 'id', 'prompt', 'mp3', 'wav', 'force', 'bpm', 'RAM', 'keep-tmp', '_global', 'C', 'minor', '·']);

/** YAML keys and other identifiers shown as they are written in scenes.yaml. */
const IDENT = /^([a-z]+(_[a-z]+)+|[\w.-]+\/[\w.-]+)$/;

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}

function words(s: string): string {
  return s.replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/&[a-z]+;/g, ' ').trim();
}

function needsTranslation(s: string): boolean {
  const t = words(s);
  if (/^https?:\/\//.test(t)) return false;
  if (!/\p{L}{2,}/u.test(t)) return false;
  return !t.split(/\s+/).every((w) => ALLOWED.has(w) || IDENT.test(w) || !/\p{L}{2,}/u.test(w));
}

// The template AST has many node kinds; a loose type keeps the walk short.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

function childrenOf(n: Node): Node[] {
  return [
    ...(n.children ?? []),
    ...(n.branches ?? []).flatMap((b: Node) => b.children ?? []),
    ...(n.cases ?? []).flatMap((c: Node) => c.children ?? []),
    ...(n.empty?.children ?? []),
    ...(n.placeholder?.children ?? []),
    ...(n.loading?.children ?? []),
    ...(n.error?.children ?? []),
  ];
}

function walk(nodes: Node[], inI18n: boolean, report: (what: string) => void): void {
  for (const n of nodes) {
    if (n instanceof TmplAstText) {
      if (!inI18n && needsTranslation(n.value)) report(`text «${n.value.trim().slice(0, 50)}»`);
      continue;
    }
    if (n.name === 'mat-icon') continue; // the text of an icon is its glyph name
    const here = inI18n || !!n.i18n;
    if (!inI18n) {
      for (const a of n.attributes ?? []) {
        if (TEXT_ATTRS.has(a.name) && !a.i18n && needsTranslation(a.value)) report(`${a.name}="${a.value.slice(0, 40)}"`);
      }
    }
    walk(childrenOf(n), here, report);
  }
}

describe('template expressions', () => {
  it('do not hide sentences in string literals (they never reach the catalog)', () => {
    const found: string[] = [];
    for (const file of htmlFiles('apps/dashboard-full/src/app')) {
      const text = readFileSync(file, 'utf8').replace(/<mat-icon[^>]*>[\s\S]*?<\/mat-icon>/g, '');
      for (const m of text.matchAll(/\{\{[^}]*\}\}/g)) {
        for (const lit of m[0].matchAll(/'([^']*)'/g)) {
          if (/[\s]|[áéíóúñÁÉÍÓÚÑ]/.test(lit[1]) && !/^[\s\d.,;\-/:%×·]+$/.test(lit[1])) found.push(`${file}: ${m[0].slice(0, 80)}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});

describe('templates', () => {
  it('have no user-facing text outside i18n', () => {
    const found: string[] = [];
    for (const file of htmlFiles('apps/dashboard-full/src/app')) {
      const parsed = parseTemplate(readFileSync(file, 'utf8'), file, { preserveWhitespaces: false });
      walk(parsed.nodes, false, (what) => found.push(`${file}: ${what}`));
    }
    expect(found).toEqual([]);
  });
});
