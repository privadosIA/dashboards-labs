import { type AssistedPlan, type Catalog, type Choices, DEFAULT_RESOLUTION, MAX_PROMPT, type Style } from '@lab/animation-core';
import { AssistFailed, type GeneratorName, type SongPort, type Written } from '@lab/music-studio-kit';
import { type Observable, catchError, map, of } from 'rxjs';

import type { Assistant, Plan } from '../model';

/** The sentence a flow starts from: the most the server keeps of a prompt. */
export const MAX_SENTENCE = MAX_PROMPT;
export const GENERATORS: readonly GeneratorName[] = ['ace-step', 'heartmula', 'diffrhythm2'];

const PART_NAME = /^[a-z][a-z0-9-]{0,39}$/;
export type PlanModel = Record<string, unknown>;

/** The song's writing, or why it did not come: the plan card keeps its fields editable either way. */
export type Writing = { written: Written } | { failed: string };

/** A title taken from the first words of the sentence, for when the assistant proposes none. */
export const titleOf = (sentence: string): string => sentence.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 60);

/** The animation's choices before the person edits them: typographic (24 fps when illustrated), the simplest level and the default size, within what the catalog offers. */
export function defaultChoices(sentence: string, catalog: Catalog | null): Choices {
  const style: Style = catalog && !catalog.styles.includes('typographic') ? (catalog.styles[0] ?? 'typographic') : 'typographic';
  const level = catalog?.levels.includes('simple') || !catalog ? 'simple' : catalog.levels[0];
  const wanted = style === 'illustrated' ? 24 : 30;
  const fps = catalog && !catalog.frameRates.includes(wanted) ? (catalog.frameRates[0] ?? wanted) : wanted;
  return { style, level, fps, resolution: DEFAULT_RESOLUTION, prompt: sentence.trim() };
}

/** The plan before anything is written: the sentence is the prompt and the song's fields are empty. */
export function defaultPlan(sentence: string, catalog: Catalog | null, song: Partial<Plan['song']> = {}, assistant: Assistant = { provider: '', model: '' }): Plan {
  return {
    song: { title: titleOf(sentence), lyrics: '', style: '', generator: 'ace-step', instrumental: false, ...(assistant.provider ? { provider: assistant.provider } : {}), ...(assistant.model ? { model: assistant.model } : {}), ...song },
    animation: { choices: defaultChoices(sentence, catalog), ...(assistant.provider ? { provider: assistant.provider } : {}), ...(assistant.model ? { model: assistant.model } : {}) },
    parts: [],
  };
}

/** The assistant of a plan: one pair for the whole run. */
export const assistantOf = (plan: Plan): Assistant => ({ provider: plan.animation.provider ?? plan.song.provider ?? '', model: plan.animation.model ?? plan.song.model ?? '' });

/** Asks the assistant to write the song from the sentence. It never errors: a refusal or a missing assistant comes back as the reason. Nothing is made on the server. */
export function writeSong(songs: SongPort, sentence: string, options: Pick<Plan['song'], 'generator' | 'instrumental' | 'provider' | 'model'>): Observable<Writing> {
  return songs
    .write({ text: sentence.trim(), generator: options.generator, instrumental: options.instrumental, ...(options.provider ? { provider: options.provider } : {}), ...(options.model ? { model: options.model } : {}) })
    .pipe(
      map((written): Writing => ({ written })),
      catchError((e: unknown) => of<Writing>({ failed: e instanceof AssistFailed ? `${e.kind}${e.detail ? `: ${e.detail}` : ''}` : e instanceof Error ? e.message : String(e) })),
    );
}

/** What the one-call plan answered, as a plan: the song's caption (ACE-Step) or tags (the others), the catalog's values or the defaults, and the prompt with the concept and the mode so the proposals read them. */
export function planFromAssisted(sentence: string, assisted: AssistedPlan, catalog: Catalog | null, assistant: Assistant = { provider: '', model: '' }, generator: GeneratorName = 'ace-step'): Plan {
  const base = defaultPlan(sentence, catalog, {}, assistant);
  const a = assisted.animation;
  const offered = <T>(value: T, list: readonly T[] | undefined, fallback: T): T => (value && (!list || list.includes(value)) ? value : fallback);
  const style = offered(a.style as Style, catalog?.styles, base.animation.choices.style);
  const fps = offered(a.fps, catalog?.frameRates, style === base.animation.choices.style ? base.animation.choices.fps : defaultChoices(sentence, catalog).fps);
  const prompt = [a.prompt || sentence.trim(), a.concept ? `Concept: ${a.concept}` : '', a.mode ? `Mode: ${a.mode}.` : ''].filter(Boolean).join('\n').slice(0, MAX_SENTENCE);
  const song = assisted.song;
  return {
    song: {
      ...base.song,
      title: song.title || base.song.title,
      lyrics: song.instrumental ? '' : song.lyrics,
      style: generator === 'ace-step' ? song.caption || song.tags : song.tags || song.caption,
      generator,
      instrumental: song.instrumental,
      ...(song.seconds > 0 ? { seconds: song.seconds } : {}),
    },
    animation: { ...base.animation, choices: { style, level: offered(a.level as Choices['level'], catalog?.levels, base.animation.choices.level), fps, resolution: DEFAULT_RESOLUTION, prompt } },
    parts: assisted.parts.map((p) => ({ name: p.name, request: p.request || p.name.replace(/-/g, ' ') })),
  };
}

/** The plan with what the assistant wrote in the song's empty fields (what the person already wrote stays). */
export function withWritten(plan: Plan, sentence: string, written: Written): Plan {
  const song = plan.song;
  return { ...plan, song: { ...song, title: written.title || song.title || titleOf(sentence), lyrics: song.lyrics || written.lyrics, style: song.style || written.style } };
}

/** `name: what it does` per line → the parts wanted. A line with no valid name is returned in `invalid` and left out. */
export function parsePartLines(text: string): { parts: Plan['parts']; invalid: string[] } {
  const parts: Plan['parts'] = [];
  const invalid: string[] = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const at = line.indexOf(':');
    const name = (at < 0 ? line : line.slice(0, at)).trim();
    const request = at < 0 ? '' : line.slice(at + 1).trim();
    if (!PART_NAME.test(name) || parts.some((p) => p.name === name)) invalid.push(line);
    else parts.push({ name, request: request || name.replace(/-/g, ' ') });
  }
  return { parts, invalid };
}

export const partLines = (parts: Plan['parts']): string => parts.map((p) => `${p.name}: ${p.request}`).join('\n');

/** The plan as the form's model (flat; the frame rate is text because it is a radio). */
export function modelOfPlan(plan: Plan): PlanModel {
  const { song } = plan;
  const { choices } = plan.animation;
  return {
    title: song.title, lyrics: song.lyrics, style: song.style, generator: song.generator, instrumental: song.instrumental, seconds: song.seconds ? String(song.seconds) : '',
    animStyle: choices.style, level: choices.level, fps: String(choices.fps), resolution: choices.resolution, prompt: choices.prompt ?? '', parts: partLines(plan.parts),
  };
}

/** The form's model as a plan, with the run's assistant on every call that writes. An empty provider or model is left out, so the server's own are used. */
export function planOfModel(m: PlanModel, assistant: Assistant = { provider: '', model: '' }): { plan: Plan; invalidParts: string[] } {
  const text = (k: string) => String(m[k] ?? '').trim();
  const { parts, invalid } = parsePartLines(String(m['parts'] ?? ''));
  const secondsValue = Number(m['seconds']);
  const seconds = Number.isInteger(secondsValue) && secondsValue > 0 ? secondsValue : undefined;
  const choices: Choices = { style: text('animStyle') as Style, level: text('level') as Choices['level'], fps: Number(m['fps']), resolution: text('resolution'), ...(text('prompt') ? { prompt: text('prompt') } : {}) };
  return {
    plan: {
      song: { title: text('title'), lyrics: String(m['lyrics'] ?? ''), style: text('style'), generator: (text('generator') || 'ace-step') as GeneratorName, instrumental: m['instrumental'] === true, ...(seconds ? { seconds } : {}), ...(assistant.provider ? { provider: assistant.provider } : {}), ...(assistant.model ? { model: assistant.model } : {}) },
      animation: { choices, ...(assistant.model ? { model: assistant.model } : {}), ...(assistant.provider ? { provider: assistant.provider } : {}) },
      parts,
    },
    invalidParts: invalid,
  };
}
