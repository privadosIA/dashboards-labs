import type { AnimationPort } from '@lab/animation-core';
import type { AnimationDataset } from '@lab/animation-dataset';
import { type Observable, catchError, concatMap, defer, forkJoin, from, map, of, scan, startWith, throwError } from 'rxjs';

import { FEATURE_EXAMPLES, FEATURE_PLAN } from './features';
import { type Marker } from './markers';
import { composePiece } from './piece';
import { type Tuple, composeTuple, entryId, titleOf } from './tuples';
import { type Example, GenerateFailed, type WriterPort } from './writer';
import { type GenerationMode, type KindDef, generationMode } from '../kinds/kinds';
import { isStyleLine, sceneLines, styleWordsOf } from '../looks/looks';

/** What a generation did that the person should read: examples put into the text by hand, a line the assistant refused (kept as written), or what the server said. */
export type GenWarning =
  | { readonly code: 'examples-inline'; readonly count: number }
  | { readonly code: 'kept-as-written'; readonly line: number; readonly detail: string }
  | { readonly code: 'server'; readonly detail: string }
  | { readonly code: 'no-plan' };

export interface GenerateDeps {
  readonly writer: WriterPort;
  readonly animation: Pick<AnimationPort, 'plan' | 'catalog'>;
}

export interface GenerateRequest {
  readonly kind: KindDef;
  /** What the server allows now: the caller works it out with `generationMode(kind, features)`. */
  readonly mode: GenerationMode;
  readonly brief: string;
  readonly negative: string;
  /** The chosen engine or model (the dataset carries none; it is told to the server's one-sentence writer). */
  readonly engine: string;
  /** The music generator (songs). */
  readonly generator: string;
  readonly instrumental: boolean;
  /** Pictures per scene (Images). */
  readonly variants: number;
  readonly language: 'es' | 'en';
  readonly assistant: { readonly provider: string; readonly model: string };
  /** At most five: the pinned presets or the best matches. */
  readonly examples: readonly Example[];
  /** The catalog's `features`. */
  readonly features: readonly string[];
  /** The tuples already written, for a song to be appended to. */
  readonly existing: readonly Tuple[];
  /** The seconds a silent scene (`- …`) is given; 2 by default. */
  readonly silenceSeconds?: number;
}

/** How far a generation is and what it has made so far: Stop keeps what was written. */
export interface Progress {
  readonly done: number;
  readonly total: number;
  readonly tuples: readonly Tuple[];
  /** The animated piece, when the kind is one. */
  readonly piece: AnimationDataset | null;
  readonly warnings: readonly GenWarning[];
  readonly finished: boolean;
}

const EMPTY: Progress = { done: 0, total: 0, tuples: [], piece: null, warnings: [], finished: false };
/** The longest text the server's writers take. */
const TEXT_LIMIT = 2000;
const MAX_INLINE_EXAMPLES = 2;

/** The mode a request is generated in, given the server's features: the caller shows it above the brief. */
export const modeFor = (kind: KindDef, features: readonly string[]): GenerationMode => generationMode(kind, features);

/**
 * Adds up to two short examples to the text itself, for a server that does not take `examples` on its calls, when the limit allows; the caller says so. Returns the text as it was when they do not fit.
 */
export function withInlineExamples(text: string, examples: readonly Example[], limit = TEXT_LIMIT): { text: string; used: number } {
  const chosen = examples.slice(0, MAX_INLINE_EXAMPLES).map((e) => e.prompt.replace(/\s+/g, ' ').trim().slice(0, 200));
  if (!chosen.length) return { text, used: 0 };
  const merged = `Examples of the house style (follow their style, never copy them):\n${chosen.map((c) => `- ${c}`).join('\n')}\n\n${text}`;
  return merged.length <= limit ? { text: merged, used: chosen.length } : { text, used: 0 };
}

/** The first quoted sentence of a line (straight, curly or angle quotes), and the line without it. */
export function takeQuote(line: string): { quote: string; rest: string } {
  const m = /["“«]([^"”»]+)["”»]/.exec(line);
  if (!m) return { quote: '', rest: line.trim() };
  return { quote: m[1].trim(), rest: `${line.slice(0, m.index)} ${line.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim() };
}

/** A `part: <name> <param>=<value>…` line: the part and its parameters (a value may be quoted), or null when the line is not one. */
export function readPartLine(line: string): { part: string; params: { name: string; value: string }[] } | null {
  const m = /^\s*part\s*:\s*(\S+)\s*(.*)$/i.exec(line);
  if (!m) return null;
  const params: { name: string; value: string }[] = [];
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  for (let p = re.exec(m[2]); p; p = re.exec(m[2])) params.push({ name: p[1], value: p[2] ?? p[3] ?? p[4] ?? '' });
  return { part: m[1], params };
}

/** One scene, graphic or picture of a storyboard, composed from a line and what the assistant wrote for it. */
interface LineContext {
  readonly req: GenerateRequest;
  readonly deps: GenerateDeps;
  readonly style: string;
  readonly examples: { send: boolean; inline: Example[]; noted: boolean };
}

function textFor(ctx: LineContext, description: string): { text: string; used: number } {
  const styled = ctx.style ? `${description}, ${ctx.style}` : description;
  if (ctx.examples.send || !ctx.examples.inline.length) return { text: styled, used: 0 };
  return withInlineExamples(styled, ctx.examples.inline);
}

function entryForLine(ctx: LineContext, line: string, index: number): Observable<{ tuple: Tuple; warnings: GenWarning[] }> {
  const { req } = ctx;
  const prefix = req.kind.id === 'graphics' ? 'g' : 's';
  const id = entryId(prefix, index);

  if (req.kind.id === 'graphics') {
    const part = readPartLine(line);
    if (part) {
      const markers: Marker[] = [{ name: 'Part', value: part.part }, ...part.params.map((p) => ({ name: `Param ${p.name}`, value: p.value }))];
      return of({ tuple: composeTuple({ id, title: part.part, prompt: '', markers }), warnings: [] });
    }
  }

  const silent = req.kind.panels.negative && /^\s*-/.test(line);
  const { quote, rest } = req.kind.id === 'graphics' ? { quote: '', rest: line.trim() } : takeQuote(line.replace(/^\s*-\s*/, ''));
  const description = rest || quote;
  const markers: Marker[] = [];
  if (quote) markers.push({ name: 'Dialogue', value: `"${quote}"` });
  if (silent) markers.push({ name: 'Silence', value: String(req.silenceSeconds ?? 2) });
  if (req.kind.panels.negative && req.negative.trim()) markers.push({ name: 'Negative', value: req.negative.trim() });
  if (req.kind.id === 'images') markers.push({ name: 'Variants', value: String(Math.max(1, Math.round(req.variants))) });

  const { text, used } = textFor(ctx, description);
  const input = { text, ...(req.assistant.provider ? { provider: req.assistant.provider } : {}), ...(req.assistant.model ? { model: req.assistant.model } : {}), ...(ctx.examples.send && req.examples.length ? { examples: req.examples } : {}) };
  const warnings: GenWarning[] = [];
  if (used && !ctx.examples.noted) {
    ctx.examples.noted = true;
    warnings.push({ code: 'examples-inline', count: used });
  }
  const written = req.kind.id === 'graphics' ? ctx.deps.writer.motion(input) : ctx.deps.writer.image(input);
  return written.pipe(
    map((prompt) => ({ tuple: composeTuple({ id, title: titleOf(description), prompt: prompt || description, markers }), warnings })),
    // A line the model declines is kept as the person wrote it, with a note; a run in progress or no assistant stops everything.
    catchError((e) => (e instanceof GenerateFailed && e.kind === 'refused' ? of({ tuple: composeTuple({ id, title: titleOf(description), prompt: description, markers }), warnings: [...warnings, { code: 'kept-as-written' as const, line: index + 1, detail: e.detail }] }) : throwError(() => e))),
  );
}

function lines(deps: GenerateDeps, req: GenerateRequest): Observable<Progress> {
  const scenes = sceneLines(req.brief);
  const ctx: LineContext = { req, deps, style: styleWordsOf(req.brief), examples: { send: req.features.includes(FEATURE_EXAMPLES), inline: [...req.examples], noted: false } };
  if (!scenes.length) return of({ ...EMPTY, finished: true });
  return from(scenes.map((line, index) => ({ line, index }))).pipe(
    concatMap(({ line, index }) => entryForLine(ctx, line, index)),
    scan((acc, { tuple, warnings }): Progress => ({ ...acc, done: acc.done + 1, tuples: [...acc.tuples, tuple], warnings: [...acc.warnings, ...warnings], finished: acc.done + 1 === scenes.length }), { ...EMPTY, total: scenes.length }),
    startWith({ ...EMPTY, total: scenes.length }),
  );
}

function sentence(deps: GenerateDeps, req: GenerateRequest): Observable<Progress> {
  const mode = req.kind.mode === 'animation' ? 'video' : req.kind.mode;
  const look = styleWordsOf(req.brief);
  const text = req.brief.split('\n').filter((l) => !isStyleLine(l)).join('\n').trim();
  const send = req.features.includes(FEATURE_EXAMPLES);
  return deps.writer
    .dataset({
      mode,
      text,
      language: req.language,
      ...(req.engine ? { engine: req.engine } : {}),
      ...(req.negative.trim() ? { negative: req.negative.trim() } : {}),
      ...(look ? { look } : {}),
      ...(req.kind.id === 'images' ? { images: { variants: Math.max(1, Math.round(req.variants)) } } : {}),
      ...(req.generator && mode === 'music' ? { generator: req.generator } : {}),
      ...(send && req.examples.length ? { examples: req.examples } : {}),
      ...(req.assistant.model ? { model: req.assistant.model } : {}),
      ...(req.assistant.provider ? { provider: req.assistant.provider } : {}),
    })
    .pipe(
      map((answer): Progress => ({ ...EMPTY, done: 1, total: 1, tuples: answer.entries, warnings: answer.warnings.map((detail) => ({ code: 'server' as const, detail })), finished: true })),
      startWith({ ...EMPTY, total: 1 }),
    );
}

function track(deps: GenerateDeps, req: GenerateRequest): Observable<Progress> {
  const inline = req.features.includes(FEATURE_EXAMPLES) ? { text: req.brief.trim(), used: 0 } : withInlineExamples(req.brief.trim(), req.examples);
  const warnings: GenWarning[] = inline.used ? [{ code: 'examples-inline', count: inline.used }] : [];
  return deps.writer
    .music({
      text: inline.text,
      generator: req.generator,
      instrumental: req.instrumental,
      ...(req.assistant.provider ? { provider: req.assistant.provider } : {}),
      ...(req.assistant.model ? { model: req.assistant.model } : {}),
      ...(req.features.includes(FEATURE_EXAMPLES) && req.examples.length ? { examples: req.examples } : {}),
    })
    .pipe(
      map((a): Progress => {
        const markers: Marker[] = [];
        if (a.lyrics && !req.instrumental) markers.push({ name: 'Lyrics', value: a.lyrics });
        if (req.generator !== 'ace-step' && a.tags) markers.push({ name: 'Tags', value: a.tags });
        if (req.instrumental) markers.push({ name: 'Instrumental', value: '' });
        const tuple = composeTuple({ id: entryId('t', req.existing.length), title: titleOf(req.brief || a.caption), prompt: a.caption, markers, order: 'prompt-first' });
        return { ...EMPTY, done: 1, total: 1, tuples: [...req.existing, tuple], warnings, finished: true };
      }),
      startWith({ ...EMPTY, total: 1, tuples: req.existing }),
    );
}

function piece(deps: GenerateDeps, req: GenerateRequest): Observable<Progress> {
  if (!req.features.includes(FEATURE_PLAN)) return of({ ...EMPTY, finished: true, warnings: [{ code: 'no-plan' }] });
  const inline = req.features.includes(FEATURE_EXAMPLES) ? { text: req.brief.trim(), used: 0 } : withInlineExamples(req.brief.trim(), req.examples);
  return forkJoin({
    plan: deps.animation.plan({ text: inline.text, language: req.language, ...(req.assistant.provider ? { provider: req.assistant.provider } : {}), ...(req.assistant.model ? { model: req.assistant.model } : {}) }),
    catalog: deps.animation.catalog(),
  }).pipe(
    map(({ plan, catalog }): Progress => ({
      ...EMPTY,
      done: 1,
      total: 1,
      piece: composePiece(plan, catalog),
      warnings: [...(inline.used ? [{ code: 'examples-inline' as const, count: inline.used }] : []), ...plan.warnings.map((detail) => ({ code: 'server' as const, detail }))],
      finished: true,
    })),
    startWith({ ...EMPTY, total: 1 }),
  );
}

/**
 * Generates the dataset of a kind in the mode the server allows: an animated piece through the plan; one song per call, appended to the ones already written; a storyboard, one assistant call per line, in sequence;
 * or the whole dataset from one sentence when the server lists `dataset`. It emits its progress as it goes and completes when everything is written: unsubscribing stops it and the last progress is what was made. A run in
 * progress or no assistant ends it with a `GenerateFailed`.
 */
export function generate(deps: GenerateDeps, req: GenerateRequest): Observable<Progress> {
  return defer(() => {
    switch (req.mode) {
      case 'plan':
        return piece(deps, req);
      case 'track':
        return track(deps, req);
      case 'sentence':
        return sentence(deps, req);
      case 'lines':
        return lines(deps, req);
    }
  });
}

/** Whether the server can write a kind's dataset from one sentence: it lists the feature and the kind is one of the three. */
export const hasSentenceMode = (kind: KindDef, features: readonly string[]): boolean => generationMode(kind, features) === 'sentence';
