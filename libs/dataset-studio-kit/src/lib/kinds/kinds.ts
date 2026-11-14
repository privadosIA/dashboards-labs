import type { DatasetMode } from '@lab/dataset-import';

export type KindId = 'video' | 'images' | 'graphics' | 'songs' | 'piece';

/** What fills the Engines panel of a kind: the question the panel asks the server. */
export type EnginesQuery = 'music-engines' | 'generation-options' | 'image-models' | 'graphics' | 'piece-catalog';

/** The panels of the brief a kind shows. */
export interface KindPanels {
  /** One text written as the shared `Negative:` line of every entry. */
  readonly negative: boolean;
  /** Realistic or illustration: style words plus a recommended model. */
  readonly look: boolean;
  /** The music generator shapes the style and the tags. */
  readonly generator: boolean;
  /** The catalog's parts can be named in a line (`part: toggle count=3`). */
  readonly parts: boolean;
}

/** One kind of dataset: a row of a table, so that adding a kind is adding a row and no code path. */
export interface KindDef {
  readonly id: KindId;
  /** What the server's import reads it as; the animated piece has its own JSON format and no import mode. */
  readonly mode: DatasetMode | 'animation';
  /** An images dataset is a video project run in images mode (`output.mode: images`). */
  readonly images: boolean;
  readonly icon: string;
  /** The brief's limit in characters: what the server's writers take (`assist`, `assist/plan`). */
  readonly limit: number;
  readonly panels: KindPanels;
  /** The one-line markers the preview reads into columns, in the order of its columns. */
  readonly markers: readonly string[];
  readonly engines: EnginesQuery;
}

/** The limit of the server's writers: `assist` and `assist/plan` take up to 2000 characters. */
export const BRIEF_LIMIT = 2000;

export const KINDS: readonly KindDef[] = [
  {
    id: 'video',
    mode: 'video',
    images: false,
    icon: 'movie',
    limit: BRIEF_LIMIT,
    panels: { negative: true, look: true, generator: false, parts: false },
    markers: ['Dialogue', 'Negative', 'Motion', 'Seed', 'Variants', 'Silence', 'Speed'],
    engines: 'generation-options',
  },
  {
    id: 'images',
    mode: 'video',
    images: true,
    icon: 'image',
    limit: BRIEF_LIMIT,
    panels: { negative: true, look: true, generator: false, parts: false },
    markers: ['Negative', 'Seed', 'Variants'],
    engines: 'image-models',
  },
  {
    id: 'graphics',
    mode: 'motion',
    images: false,
    icon: 'animation',
    limit: BRIEF_LIMIT,
    panels: { negative: false, look: false, generator: false, parts: true },
    markers: ['Graphic', 'Duration', 'Overlay', 'Part', 'Param', 'Text', 'BPM', 'Design'],
    engines: 'graphics',
  },
  {
    id: 'songs',
    mode: 'music',
    images: false,
    icon: 'music_note',
    limit: BRIEF_LIMIT,
    panels: { negative: false, look: false, generator: true, parts: false },
    markers: ['Lyrics', 'Tags', 'Instrumental', 'BPM', 'Key'],
    engines: 'music-engines',
  },
  {
    id: 'piece',
    mode: 'animation',
    images: false,
    icon: 'smart_display',
    limit: BRIEF_LIMIT,
    panels: { negative: false, look: false, generator: false, parts: false },
    markers: [],
    engines: 'piece-catalog',
  },
];

export const kindOf = (id: KindId): KindDef => KINDS.find((k) => k.id === id) ?? KINDS[0];

/** The kinds whose dataset is the server's tuple format (`[id, title, lora_info, text]`), previewed and created by the import. */
export const isTupleKind = (kind: KindDef): boolean => kind.mode !== 'animation';

/** How a kind is generated with the server there is: `lines` (one line per scene, expanded one by one), `sentence` (the server writes it all), `plan` (the animated piece) or `track` (one song). */
export type GenerationMode = 'lines' | 'sentence' | 'plan' | 'track';

/** The mode a kind uses, given what the server lists in the catalog's `features`. */
export function generationMode(kind: KindDef, features: readonly string[]): GenerationMode {
  if (kind.id === 'piece') return 'plan';
  if (kind.id === 'songs') return 'track';
  return features.includes('dataset') ? 'sentence' : 'lines';
}

/** Whether the brief fits the kind's limit, and the length it has. */
export function briefFits(kind: KindDef, brief: string): { ok: boolean; length: number } {
  return { ok: brief.length <= kind.limit, length: brief.length };
}
