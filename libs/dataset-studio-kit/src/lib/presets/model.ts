import type { KindId } from '../kinds/kinds';

/** What a preset is a prompt for. */
export type PresetKind = 'image' | 'video' | 'motion' | 'music' | 'animation';
export const PRESET_KINDS: readonly PresetKind[] = ['image', 'video', 'motion', 'music', 'animation'];

/** The longest prompt a preset may hold: what the server's writers take. */
export const MAX_PRESET_PROMPT = 2000;

/** A prompt worth keeping, with where it came from. Nothing enters without a `source` and a `licence`. */
export interface Preset {
  readonly id: string;
  readonly kind: PresetKind;
  readonly title: string;
  readonly prompt: string;
  readonly negative?: string;
  readonly tags: readonly string[];
  readonly engine?: string;
  readonly language: string;
  readonly source: string;
  readonly source_id?: string;
  readonly licence: string;
  readonly nsfw?: boolean;
  /** The person's own (can be deleted); a bundled or imported one is read-only. */
  readonly own: boolean;
  readonly created_at: string;
}

/** What is written to add one: the store makes the id and the date. */
export type NewPreset = Omit<Preset, 'id' | 'created_at' | 'own'>;

/** A file of presets, as the server's `orchestrator prompts fetch --out` writes it and the Presets page imports it. */
export interface PresetBundle {
  readonly format: 'prompt-presets';
  readonly version: 1;
  readonly items: readonly unknown[];
  readonly meta?: Record<string, unknown>;
}

export interface PresetQuery {
  readonly kind?: PresetKind;
  readonly q?: string;
  readonly tags?: readonly string[];
  readonly limit?: number;
}

export interface PresetList {
  readonly items: readonly Preset[];
  readonly total: number;
}

/** What an import did: how many were added, how many were already there (same `source` and `source_id`) and which were refused, by their index in the file. */
export interface ImportReport {
  readonly added: number;
  readonly already: number;
  readonly refused: readonly { index: number; reason: string }[];
}

/** The server has no store of presets (`/api/prompts`), or it cannot be reached for it. */
export class PromptsUnavailable extends Error {
  constructor(message = 'The server has no store of prompt presets.') {
    super(message);
    this.name = 'PromptsUnavailable';
  }
}

/** The preset kind that serves a studio kind. */
export const presetKindOf = (kind: KindId): PresetKind => ({ video: 'video', images: 'image', graphics: 'motion', songs: 'music', piece: 'animation' })[kind] as PresetKind;

/** What a studio kind's brief is called by a preset: the reverse of `presetKindOf` for the kinds that share one (`video` and `images` have their own). */
export const kindOfPreset = (kind: PresetKind): KindId => ({ video: 'video', image: 'images', motion: 'graphics', music: 'songs', animation: 'piece' })[kind] as KindId;
