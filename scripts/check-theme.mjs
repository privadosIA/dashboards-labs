#!/usr/bin/env node
// Checks the design tokens of every dashboard (and of the template): each `--lab-*` property a stylesheet uses is
// defined in src/theme/_tokens.scss, and each colour token has a dark value as well as a light one.
// Tailwind may draw only with those tokens: a dashboard's `tailwind.css` (its bridge) holds no colour literal and uses only
// tokens it defines, and no template (`.html`, in a dashboard or a library) has an arbitrary colour in a class (`bg-[#fff]`),
// a class of Tailwind's default palette (`bg-zinc-200`, `text-white`) or a `dark:` variant: the theme follows the tokens.
// Every dashboard (and the template) defines `--lab-field-gap`, the space between form fields, and it is at least `--lab-space-3`.
//
//   node scripts/check-theme.mjs [SRC ...]      (default: apps/*/src that have a theme, the template and libs/*/src templates)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLOUR = /^(#|rgb|hsl|oklch|oklab|color-mix|light-dark)/i;
const DARK = '@media (prefers-color-scheme: dark)';
const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/i;
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// Tailwind in a template: what would draw with a colour that is not a token.
const UTILITY = 'bg|text|border|ring|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|shadow|placeholder';
const ARBITRARY_COLOUR = /-\[[^\]]*(?:#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\()/i;
const DEFAULT_PALETTE = new RegExp(
  `(?<![\\w-])(?:${UTILITY})-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}|white|black)(?:/\\d+)?(?![\\w-])`,
);
const DARK_VARIANT = /(?<![\w-])dark:[\w[!-]/;
// The Angular comments `<!-- -->` may mention a class; nothing there draws.
const withoutHtmlComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

function* filesWith(dir, ext) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* filesWith(full, ext);
    else if (entry.endsWith(ext)) yield full;
  }
}
const scss = (dir) => filesWith(dir, '.scss');

/** The problems of the templates under `dir`: what would let Tailwind draw with something other than a token. */
export function templateProblems(dir, shown = (p) => relative(process.cwd(), p) || p) {
  const problems = [];
  for (const file of filesWith(dir, '.html')) {
    const html = withoutHtmlComments(readFileSync(file, 'utf8'));
    if (ARBITRARY_COLOUR.test(html)) problems.push(`${shown(file)}: has an arbitrary colour in a class; draw with a token utility`);
    if (DEFAULT_PALETTE.test(html)) problems.push(`${shown(file)}: has a class of Tailwind's default palette; draw with a token utility`);
    if (DARK_VARIANT.test(html)) problems.push(`${shown(file)}: has a dark: variant; the theme follows the tokens`);
  }
  return problems;
}

/** The block `:root[data-theme='<theme>'] { … }` of a tokens file: where it starts and what is inside. */
function pinnedBlock(text, theme) {
  const match = new RegExp(`:root\\[data-theme='${theme}'\\]\\s*{([^}]*)}`).exec(text);
  return match ? { at: match.index, body: match[1] } : null;
}

const declared = (block) => new Map([...block.matchAll(/(--lab-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

/** The problems of the theme of one dashboard (`src` is its src folder). */
export function checkTheme(src, shown = (p) => relative(process.cwd(), p) || p) {
  const tokensFile = join(src, 'theme/_tokens.scss');
  if (!existsSync(tokensFile)) return [`${shown(tokensFile)}: the dashboard has no tokens file`];
  const text = readFileSync(tokensFile, 'utf8');
  const at = text.indexOf(DARK);
  // The pinned blocks come after the system's dark block: what a person chose beats the system's preference.
  const pinned = { dark: pinnedBlock(text, 'dark'), light: pinnedBlock(text, 'light') };
  const firstPinned = Math.min(...Object.values(pinned).map((b) => (b ? b.at : Infinity)));
  const light = declared(at < 0 ? text : text.slice(0, at));
  const dark = declared(at < 0 ? '' : text.slice(at, Math.min(firstPinned, text.length)));
  const problems = [];
  if (at < 0) problems.push(`${shown(tokensFile)}: there is no dark block (${DARK})`);
  for (const [token, value] of light) {
    if (COLOUR.test(value) && !dark.has(token)) problems.push(`${shown(tokensFile)}: ${token} is a colour and has no dark value`);
  }
  for (const token of dark.keys()) {
    if (!light.has(token)) problems.push(`${shown(tokensFile)}: ${token} has a dark value and no light value`);
  }
  for (const [theme, values] of [['light', light], ['dark', dark]]) {
    const block = pinned[theme];
    if (!block) {
      problems.push(`${shown(tokensFile)}: there is no pinned ${theme} block (:root[data-theme='${theme}'])`);
      continue;
    }
    const here = declared(block.body);
    for (const [token, value] of values) {
      if (!COLOUR.test(value)) continue;
      if (!here.has(token)) problems.push(`${shown(tokensFile)}: ${token} is missing from the pinned ${theme} block`);
      else if (here.get(token) !== value) problems.push(`${shown(tokensFile)}: ${token} is ${here.get(token)} in the pinned ${theme} block and ${value} in the ${theme} values`);
    }
    if (!new RegExp(`color-scheme:\\s*${theme}\\b`).test(block.body)) problems.push(`${shown(tokensFile)}: the pinned ${theme} block does not set color-scheme: ${theme}`);
  }
  for (const file of scss(src)) {
    if (file === tokensFile) continue;
    const css = readFileSync(file, 'utf8');
    if (!file.startsWith(join(src, 'theme') + sep) && LITERAL_COLOUR.test(withoutComments(css))) {
      problems.push(`${shown(file)}: has a colour literal; a dashboard draws with its --lab-* tokens`);
    }
    for (const [, token] of css.matchAll(/var\((--lab-[\w-]+)/g)) {
      if (!light.has(token)) problems.push(`${shown(file)}: uses ${token}, which _tokens.scss does not define`);
    }
  }
  // The Tailwind bridge: plain CSS that maps tokens to utilities, so it holds no colour of its own and names only defined tokens.
  const bridge = join(src, 'tailwind.css');
  if (existsSync(bridge)) {
    const css = withoutComments(readFileSync(bridge, 'utf8'));
    if (LITERAL_COLOUR.test(css)) problems.push(`${shown(bridge)}: has a colour literal; the bridge only maps --lab-* tokens`);
    for (const [, token] of css.matchAll(/var\((--lab-[\w-]+)/g)) {
      if (!light.has(token)) problems.push(`${shown(bridge)}: maps ${token}, which _tokens.scss does not define`);
    }
  }
  problems.push(...templateProblems(src, shown));
  return [...new Set(problems)];
}

const FIELD_GAP = '--lab-field-gap';

/** A token as a length in pixels (`px`, or `rem` at 16px), following `var(--lab-…)` inside the same file; null when it is not one. */
function lengthPx(tokens, name, seen = new Set()) {
  const raw = tokens.get(name);
  if (raw === undefined || seen.has(name)) return null;
  seen.add(name);
  const ref = /^var\(\s*(--lab-[\w-]+)\s*\)$/.exec(raw);
  if (ref) return lengthPx(tokens, ref[1], seen);
  const length = /^(-?\d*\.?\d+)(px|rem)$/.exec(raw);
  return length ? Number(length[1]) * (length[2] === 'rem' ? 16 : 1) : null;
}

/** The problems of the field gap of one dashboard (`src` is its src folder): the token exists and is at least `--lab-space-3`. */
export function checkFieldGap(src, shown = (p) => relative(process.cwd(), p) || p) {
  const tokensFile = join(src, 'theme/_tokens.scss');
  if (!existsSync(tokensFile)) return [];
  const text = readFileSync(tokensFile, 'utf8');
  const at = text.indexOf(DARK);
  const tokens = declared(at < 0 ? text : text.slice(0, at));
  if (!tokens.has(FIELD_GAP)) return [`${shown(tokensFile)}: has no ${FIELD_GAP}, the space between form fields`];
  const gap = lengthPx(tokens, FIELD_GAP);
  const base = lengthPx(tokens, '--lab-space-3');
  if (gap === null || base === null) return [`${shown(tokensFile)}: ${FIELD_GAP} and --lab-space-3 must be lengths in px or rem (or a var() of one)`];
  if (gap < base) return [`${shown(tokensFile)}: ${FIELD_GAP} (${gap}px) is smaller than --lab-space-3 (${base}px): form fields must breathe`];
  return [];
}

/**
 * The problems of the stylesheets of a library that dashboards show (`src` is its src folder): it draws only with the
 * `--lab-*` tokens, so no colour literal, and every token it uses is defined by every dashboard (`dashboards` are their src folders).
 */
export function checkLibraryStyles(src, dashboards, shown = (p) => relative(process.cwd(), p) || p) {
  const defined = dashboards.map((dashboard) => {
    const text = readFileSync(join(dashboard, 'theme/_tokens.scss'), 'utf8');
    const at = text.indexOf(DARK);
    return { dashboard, tokens: declared(at < 0 ? text : text.slice(0, at)) };
  });
  const problems = [];
  for (const file of scss(src)) {
    const text = readFileSync(file, 'utf8');
    if (LITERAL_COLOUR.test(text)) problems.push(`${shown(file)}: has a colour literal; a library draws with the --lab-* tokens`);
    for (const [, token] of text.matchAll(/var\((--lab-[\w-]+)/g)) {
      for (const { dashboard, tokens } of defined) {
        if (!tokens.has(token)) problems.push(`${shown(file)}: uses ${token}, which ${shown(join(dashboard, 'theme/_tokens.scss'))} does not define`);
      }
    }
  }
  return [...new Set(problems)];
}

/** The libraries with stylesheets (the folders of `libs/` that have some and no theme of their own). */
export function librarySources() {
  const libs = join(root, 'libs');
  return readdirSync(libs)
    .map((name) => join(libs, name, 'src'))
    .filter((src) => existsSync(src) && !existsSync(join(src, 'theme')) && [...scss(src)].length > 0);
}

/** Every library's src folder: their templates are drawn with the tokens of whichever dashboard shows them. */
export function libraryTemplateSources() {
  const libs = join(root, 'libs');
  return readdirSync(libs)
    .map((name) => join(libs, name, 'src'))
    .filter((src) => existsSync(src));
}

export function dashboardSources() {
  const apps = join(root, 'apps');
  const found = readdirSync(apps)
    .map((name) => join(apps, name, 'src'))
    .filter((src) => existsSync(join(src, 'theme')));
  // The generator's template is a source too; the public edition has no generator, so no template.
  return [...found, join(root, 'templates/dashboard/src')].filter((src) => existsSync(join(src, 'theme')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = process.argv.length > 2 ? process.argv.slice(2).map((s) => resolve(s)) : dashboardSources();
  const libraries = process.argv.length > 2 ? [] : librarySources();
  const templates = process.argv.length > 2 ? [] : libraryTemplateSources();
  const problems = [
    ...sources.flatMap((src) => [...checkTheme(src), ...checkFieldGap(src)]),
    ...libraries.flatMap((src) => checkLibraryStyles(src, sources)),
    ...templates.flatMap((src) => templateProblems(src)),
  ];
  if (problems.length) {
    for (const p of problems) console.error(`check-theme: ${p}`);
    process.exit(1);
  }
  console.log(`check-theme: the tokens of ${sources.length} dashboard${sources.length === 1 ? '' : 's'} are complete` + (libraries.length ? `, and the styles of ${libraries.length} librar${libraries.length === 1 ? 'y' : 'ies'} use only them` : ''));
}
