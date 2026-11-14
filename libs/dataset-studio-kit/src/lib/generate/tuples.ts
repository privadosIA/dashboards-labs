import { type Marker, parseText, writeText } from './markers';

/** The server's tuple format: `[id, title, lora_info, text]`. */
export type Tuple = [id: string, title: string, loraInfo: string, text: string];

/** The id of the n-th entry of a kind (`s01`, `s02`… for scenes and pictures, `g01` for graphics, `t01` for tracks). */
export const entryId = (prefix: string, index: number): string => `${prefix}${String(index + 1).padStart(2, '0')}`;

/** A title from a description: the text before the first comma or full stop, up to 60 characters, with the quotes and a leading dash taken off. */
export function titleOf(text: string): string {
  const cleaned = text.replace(/^[\s-]+/, '').replace(/["«»“”]/g, '').trim();
  const first = cleaned.split(/[,.;:]/)[0].trim() || cleaned;
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
}

export interface EntryParts {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly markers: readonly Marker[];
  readonly loraInfo?: string;
  readonly order?: 'markers-first' | 'prompt-first';
}

export const composeTuple = (e: EntryParts): Tuple => [e.id, e.title, e.loraInfo ?? '', writeText(e.prompt, e.markers, e.order)];

/** The dataset file as the server reads it: a JSON list of tuples, pretty-printed so a person can edit it. */
export const serializeTuples = (entries: readonly Tuple[]): string => JSON.stringify(entries, null, 2);

export type ParsedTuples = { ok: true; entries: Tuple[] } | { ok: false; error: string };

/** Reads the raw file back: a JSON list of `[id, title, lora_info, text]`; the error names what is wrong. */
export function parseTuples(raw: string): ParsedTuples {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!Array.isArray(data)) return { ok: false, error: 'the dataset must be a list of entries' };
  const entries: Tuple[] = [];
  for (const [i, e] of data.entries()) {
    if (!Array.isArray(e) || e.length < 4 || e.slice(0, 4).some((x) => typeof x !== 'string')) return { ok: false, error: `entry ${i + 1} must be [id, title, lora_info, text]` };
    entries.push([e[0], e[1], e[2], e[3]]);
  }
  return { ok: true, entries };
}

/** An entry's text with one marker set, replaced or added, keeping the order of the others. */
export function setEntryMarker(text: string, name: string, value: string, order: 'markers-first' | 'prompt-first' = 'markers-first'): string {
  const parsed = parseText(text);
  const markers = parsed.markers.some((m) => m.name === name) ? parsed.markers.map((m) => (m.name === name ? { name, value } : m)).filter((m) => m.value !== '' || m.name === 'Instrumental') : value === '' ? [...parsed.markers] : [...parsed.markers, { name, value }];
  return writeText(parsed.prompt, markers, order);
}
