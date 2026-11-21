// Keeps src/locale/messages.es.json (id -> Spanish text, placeholders as {$NAME})
// in step with the extracted catalog src/locale/messages.xlf (English source):
// new ids are added with the English text (to be translated), ids that no longer
// exist are dropped, translations already written are kept.
//
//   npm run dashboard-full:i18n
//
// While areas are still arriving from the server's app, I18N_SEED=<its messages.es.json> gives the translation of a
// new id instead of the English text.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const XLF = new URL('./src/locale/messages.xlf', import.meta.url);
const ES = new URL('./src/locale/messages.es.json', import.meta.url);

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function sourcesOf(xlf) {
  const out = {};
  for (const m of xlf.matchAll(/<trans-unit id="([^"]+)"[^>]*>\s*<source>([\s\S]*?)<\/source>/g)) {
    out[m[1]] = decode(m[2].replace(/<x id="([^"]+)"[^>]*\/>/g, '{$$$1}'));
  }
  return out;
}

const src = sourcesOf(readFileSync(XLF, 'utf8'));
const old = existsSync(ES) ? JSON.parse(readFileSync(ES, 'utf8')) : {};
const seed = process.env.I18N_SEED ? JSON.parse(readFileSync(process.env.I18N_SEED, 'utf8')) : {};
const next = {};
let added = 0;
for (const id of Object.keys(src)) {
  if (id in old) next[id] = old[id];
  else {
    next[id] = seed[id] ?? src[id];
    added++;
  }
}
const dropped = Object.keys(old).filter((id) => !(id in src)).length;
writeFileSync(ES, JSON.stringify(next, null, 2) + '\n');
console.log(`${Object.keys(next).length} messages (${added} new to translate, ${dropped} dropped)`);
