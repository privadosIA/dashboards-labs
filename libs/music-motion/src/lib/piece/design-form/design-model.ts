import type { Design, Mode, PieceDetail } from '@lab/animation-core';

type FormModel = Record<string, unknown>;

/** The tags of the sections of a song, once each, in the order they come. */
export const sectionTags = (piece: Pick<PieceDetail, 'songMap'>): string[] => [...new Set(piece.songMap.sections.map((s) => s.tag.toLowerCase()))];

export const modeKey = (i: number): string => `mode_${i}`;

/** The design as the form holds it: one field for each colour, typeface and the concept, and a `mode_<n>` for each section tag. */
export function toModel(design: Design, tags: readonly string[]): FormModel {
  const model: FormModel = { dark: design.dark, light: design.light, accent: design.accent, display: design.display, body: design.body, defaultMode: design.defaultMode, concept: design.concept, verseStyle: design.verseStyle ?? 'plain', hitStyle: design.hitStyle ?? 'plain' };
  tags.forEach((tag, i) => (model[modeKey(i)] = design.modes[tag] ?? design.defaultMode));
  return model;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** A style as the form holds it: plain (the empty choice) is nothing, and a value the dashboard has no name for is kept as it is. */
const choice = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' && v !== 'plain' ? v : undefined);
const mode = (v: unknown, fallback: Mode): Mode => (v === 'dark' || v === 'light' ? v : fallback);

/** A plain style is an empty choice: it is not part of the design. */
const pickStyle = <K extends 'verseStyle' | 'hitStyle'>(key: K, value: string | undefined): Partial<Design> => (value ? { [key]: value } : {});

/** The design the form holds. A tag whose mode is the default one is still written: the person chose it. */
export function fromModel(model: FormModel, tags: readonly string[]): Design {
  const defaultMode = mode(model['defaultMode'], 'dark');
  return {
    dark: text(model['dark']),
    light: text(model['light']),
    accent: text(model['accent']),
    display: text(model['display']),
    body: text(model['body']),
    defaultMode,
    modes: Object.fromEntries(tags.map((tag, i) => [tag, mode(model[modeKey(i)], defaultMode)])),
    concept: typeof model['concept'] === 'string' ? model['concept'] : '',
    ...pickStyle('verseStyle', choice(model['verseStyle'])),
    ...pickStyle('hitStyle', choice(model['hitStyle'])),
  };
}

const FIELDS = ['dark', 'light', 'accent', 'display', 'body', 'default_mode', 'modes', 'concept'] as const;
export type DesignField = (typeof FIELDS)[number];

/** The field a server reason is about: it starts with the name of the field (`accent #ff0000 has less than…`). */
export function fieldOf(reason: string): DesignField | null {
  const first = /^\s*([a-z_]+)\b/.exec(reason)?.[1];
  return FIELDS.find((f) => f === first) ?? null;
}
