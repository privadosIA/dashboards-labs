import { MAX_RHYTHM, MIN_RHYTHM, type Design, type Mode, type Preset, type PresetInput } from '@lab/animation-core';

type FormModel = Record<string, unknown>;

/** The preset as the form holds it. The modes of the song's sections are not the preset's to edit: they are kept as they are. */
export function toModel(preset: Preset): FormModel {
  const d = preset.design;
  return {
    name: preset.name,
    rhythm: preset.rhythm,
    dark: d.dark,
    light: d.light,
    accent: d.accent,
    display: d.display,
    body: d.body,
    defaultMode: d.defaultMode,
    concept: d.concept,
    verseStyle: d.verseStyle ?? 'plain',
    hitStyle: d.hitStyle ?? 'plain',
    parts: [...preset.parts],
  };
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const mode = (v: unknown, fallback: Mode): Mode => (v === 'dark' || v === 'light' ? v : fallback);
/** A style as the form holds it: plain is nothing, and a value this dashboard has no name for is kept as it is. */
const style = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' && v !== 'plain' ? v : undefined);

/** What the form holds, as the preset to save: the rest of the design (the modes) comes from the preset being edited. */
export function fromModel(model: FormModel, from: Preset): PresetInput {
  const base = from.design;
  const design: Design = {
    dark: text(model['dark']),
    light: text(model['light']),
    accent: text(model['accent']),
    display: text(model['display']),
    body: text(model['body']),
    defaultMode: mode(model['defaultMode'], base.defaultMode),
    modes: { ...base.modes },
    concept: typeof model['concept'] === 'string' ? model['concept'] : '',
    ...(style(model['verseStyle']) ? { verseStyle: style(model['verseStyle']) } : {}),
    ...(style(model['hitStyle']) ? { hitStyle: style(model['hitStyle']) } : {}),
  };
  const parts = Array.isArray(model['parts']) ? (model['parts'] as unknown[]).filter((p): p is string => typeof p === 'string') : [];
  return { name: text(model['name']), design, rhythm: Number(model['rhythm']), parts };
}

export type PresetField = 'name' | 'rhythm' | 'accent' | 'parts';

/** The field a server reason is about, by how it starts: `rhythm …`, `design.accent …`, `parts[0] …`, `name …`. */
export function presetFieldOf(reason: string): PresetField | null {
  const first = /^\s*(design\.[a-z_]+|[a-z_]+)/.exec(reason)?.[1];
  if (first === 'rhythm' || first === 'name' || first === 'parts') return first;
  return first === 'design.accent' ? 'accent' : null;
}

export const RHYTHM_RANGE = `${MIN_RHYTHM}–${MAX_RHYTHM}`;
