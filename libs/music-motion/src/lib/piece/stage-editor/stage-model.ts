import type { Catalog, Stage, StageCharacter } from '@lab/animation-core';

type FormModel = Record<string, unknown>;

export const charKey = (i: number, field: string): string => `c${i}_${field}`;
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);
const round = (n: number): number => Math.round(n * 10) / 10;

/** The fields of the stage's form: the background and, for each character, its choices and its place. */
export function toStageModel(stage: Stage | undefined): FormModel {
  const model: FormModel = { background: stage?.background ?? '' };
  (stage?.characters ?? []).forEach((c, i) => {
    model[charKey(i, 'character')] = c.character;
    model[charKey(i, 'pose')] = c.pose ?? '';
    model[charKey(i, 'expression')] = c.expression ?? '';
    model[charKey(i, 'action')] = c.action ?? '';
    model[charKey(i, 'x')] = c.x;
    model[charKey(i, 'y')] = c.y;
    model[charKey(i, 'size')] = c.size;
  });
  return model;
}

const number = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : v === '' || v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * The stage the form holds. A pose or expression the chosen character does not have is replaced by that character's first
 * (changing the character changes what it can do), the place is kept inside the frame and a character that is not in the
 * catalog is kept as it is, for the server to say.
 */
export function fromStageModel(model: FormModel, before: Stage | undefined, catalog: Catalog): Stage {
  const background = String(model['background'] ?? '');
  const characters = (before?.characters ?? []).map((old, i): StageCharacter => {
    const name = String(model[charKey(i, 'character')] ?? old.character);
    const entry = catalog.characters.find((c) => c.name === name);
    const pick = (field: string, options: readonly string[] | undefined, was: string | undefined): string | undefined => {
      const v = String(model[charKey(i, field)] ?? '');
      if (!options) return v || undefined;
      return v && options.includes(v) ? v : name !== old.character ? options[0] : was && options.includes(was) ? was : undefined;
    };
    const pose = pick('pose', entry?.poses, old.pose);
    const expression = pick('expression', entry?.expressions, old.expression);
    const action = String(model[charKey(i, 'action')] ?? '') || undefined;
    return {
      character: name,
      ...(pose ? { pose } : {}),
      ...(expression ? { expression } : {}),
      ...(action ? { action } : {}),
      x: round(clamp(number(model[charKey(i, 'x')], old.x), 0, 100)),
      y: round(clamp(number(model[charKey(i, 'y')], old.y), 0, 100)),
      size: round(clamp(number(model[charKey(i, 'size')], old.size), 1, 100)),
    };
  });
  return { ...(background ? { background } : {}), ...(characters.length ? { characters } : {}) };
}

/** A stage with one more character: the catalog's first, in its first pose and expression, in the middle low. */
export function addCharacter(stage: Stage | undefined, catalog: Catalog): Stage {
  const first = catalog.characters[0];
  if (!first) return stage ?? {};
  const added: StageCharacter = { character: first.name, ...(first.poses[0] ? { pose: first.poses[0] } : {}), ...(first.expressions[0] ? { expression: first.expressions[0] } : {}), x: 50, y: 85, size: 40 };
  return { ...(stage ?? {}), characters: [...(stage?.characters ?? []), added] };
}

/** A stage without the `i`th character; with no character and no background left, no stage at all. */
export function removeCharacter(stage: Stage | undefined, i: number): Stage | null {
  const characters = (stage?.characters ?? []).filter((_, k) => k !== i);
  const next: Stage = { ...(stage?.background ? { background: stage.background } : {}), ...(characters.length ? { characters } : {}) };
  return next.background || next.characters ? next : null;
}

/** Whether two stages say the same thing. */
export const sameStage = (a: Stage | undefined, b: Stage | undefined): boolean => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
