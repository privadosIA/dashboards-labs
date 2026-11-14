import { MAX_PRESET_PROMPT, PRESET_KINDS, type ImportReport, type NewPreset, type Preset, type PresetKind, type PresetList, type PresetQuery } from './model';

const words = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);

/** The first line of a prompt, for a card. */
export const firstLine = (prompt: string): string => prompt.split('\n').find((l) => l.trim())?.trim() ?? '';

/** How well a preset matches the words of a query: a word in the title counts 3, in a tag 2, in the prompt 1; every word has to match something. */
export function matchScore(preset: Preset, terms: readonly string[]): number {
  if (!terms.length) return 1;
  const title = preset.title.toLowerCase();
  const tags = preset.tags.map((t) => t.toLowerCase());
  const prompt = preset.prompt.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const here = (title.includes(term) ? 3 : 0) + (tags.some((t) => t.includes(term)) ? 2 : 0) + (prompt.includes(term) ? 1 : 0);
    if (!here) return 0;
    score += here;
  }
  return score;
}

/** The presets a query asks for, best match first, then the newest; `total` is how many matched before the limit. */
export function searchPresets(all: readonly Preset[], query: PresetQuery): PresetList {
  const terms = words(query.q ?? '');
  const wanted = (query.tags ?? []).map((t) => t.toLowerCase());
  const hits = all
    .filter((p) => !query.kind || p.kind === query.kind)
    .filter((p) => wanted.every((t) => p.tags.some((x) => x.toLowerCase() === t)))
    .map((p) => ({ p, score: matchScore(p, terms) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || b.p.created_at.localeCompare(a.p.created_at) || a.p.title.localeCompare(b.p.title));
  return { items: hits.slice(0, query.limit ?? 50).map((h) => h.p), total: hits.length };
}

/** What a generation sends the assistant as examples: at most five, never the library. */
export const MAX_EXAMPLES = 5;

export interface ExampleContext {
  readonly kind: PresetKind;
  readonly engine?: string;
  readonly tags?: readonly string[];
  /** The words of the brief. */
  readonly text: string;
}

/**
 * The examples of a generation: the pinned presets when there are any (up to five), else the best matches for the kind, the engine, the tags and the words of the brief (up to five).
 * A preset that matches nothing is never chosen: no match, no example.
 */
export function chooseExamples(all: readonly Preset[], pinned: readonly Preset[], context: ExampleContext): readonly Preset[] {
  if (pinned.length) return pinned.slice(0, MAX_EXAMPLES);
  const terms = [...new Set(words(context.text))];
  const tags = (context.tags ?? []).map((t) => t.toLowerCase());
  const scored = all
    .filter((p) => p.kind === context.kind)
    .map((p) => {
      const base = terms.length ? matchAny(p, terms) : 0;
      const engine = context.engine && p.engine === context.engine ? 2 : 0;
      const tagHits = p.tags.filter((t) => tags.includes(t.toLowerCase())).length * 2;
      return { p, score: base + (base || tagHits ? engine : 0) + tagHits };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.p.created_at.localeCompare(a.p.created_at));
  return scored.slice(0, MAX_EXAMPLES).map((s) => s.p);
}

/** Words of the brief found in a preset, weighted like a search but with no need for every word to match. */
function matchAny(preset: Preset, terms: readonly string[]): number {
  const title = preset.title.toLowerCase();
  const tags = preset.tags.map((t) => t.toLowerCase());
  const prompt = preset.prompt.toLowerCase();
  let score = 0;
  for (const term of terms) score += (title.includes(term) ? 3 : 0) + (tags.some((t) => t.includes(term)) ? 2 : 0) + (prompt.includes(term) ? 1 : 0);
  return score;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Why an item of a bundle cannot be taken, or null when it can: no kind the kit knows, no prompt, a prompt over the limit, no source, no licence. */
export function refusalOf(item: unknown): string | null {
  if (!isObject(item)) return 'it is not an object';
  if (!PRESET_KINDS.includes(item['kind'] as PresetKind)) return 'it has no valid kind';
  if (typeof item['prompt'] !== 'string' || !item['prompt'].trim()) return 'it has no prompt';
  if (item['prompt'].length > MAX_PRESET_PROMPT) return `its prompt is over ${MAX_PRESET_PROMPT} characters`;
  if (typeof item['source'] !== 'string' || !item['source'].trim()) return 'it has no source';
  if (typeof item['licence'] !== 'string' || !item['licence'].trim()) return 'it has no licence';
  return null;
}

/** The key two presets share when they are the same one from the same source. */
export const sourceKey = (p: { source: string; source_id?: string }): string | null => (p.source_id ? `${p.source}\u0000${p.source_id}` : null);

/** An item of a bundle read as a preset to add, keeping what the script wrote (`source`, `source_id`, `licence`, `nsfw`, `language`). */
export function toNewPreset(item: Record<string, unknown>): NewPreset {
  const str = (k: string): string | undefined => (typeof item[k] === 'string' && (item[k] as string).trim() ? (item[k] as string).trim() : undefined);
  const prompt = String(item['prompt']).trim();
  return {
    kind: item['kind'] as PresetKind,
    title: str('title') ?? firstLine(prompt).slice(0, 60),
    prompt,
    ...(str('negative') ? { negative: str('negative') } : {}),
    tags: Array.isArray(item['tags']) ? item['tags'].filter((t): t is string => typeof t === 'string') : [],
    ...(str('engine') ? { engine: str('engine') } : {}),
    language: str('language') ?? 'en',
    source: String(item['source']).trim(),
    ...(str('source_id') ? { source_id: str('source_id') } : {}),
    licence: String(item['licence']).trim(),
    ...(typeof item['nsfw'] === 'boolean' ? { nsfw: item['nsfw'] } : {}),
  };
}

/** Reads a bundle: the items to add (the ones not already in `existing` by source and source id, nor repeated inside the bundle) and the report of what was refused and what was already there. */
export function readBundle(bundle: unknown, existing: readonly { source: string; source_id?: string }[]): { toAdd: NewPreset[]; report: ImportReport } {
  if (!isObject(bundle) || bundle['format'] !== 'prompt-presets' || bundle['version'] !== 1 || !Array.isArray(bundle['items'])) {
    return { toAdd: [], report: { added: 0, already: 0, refused: [{ index: -1, reason: 'it is not a prompt-presets bundle of version 1' }] } };
  }
  const seen = new Set(existing.map(sourceKey).filter((k): k is string => !!k));
  const toAdd: NewPreset[] = [];
  const refused: { index: number; reason: string }[] = [];
  let already = 0;
  (bundle['items'] as unknown[]).forEach((item, index) => {
    const reason = refusalOf(item);
    if (reason) return void refused.push({ index, reason });
    const preset = toNewPreset(item as Record<string, unknown>);
    const key = sourceKey(preset);
    if (key && seen.has(key)) return void (already += 1);
    if (key) seen.add(key);
    toAdd.push(preset);
  });
  return { toAdd, report: { added: toAdd.length, already, refused } };
}
