import type { components } from '@lab/api-client';

import {
  LEVELS,
  MODES,
  STYLES,
  type Catalog,
  type AssistModels,
  type AssistedPlan,
  type PlanInput,
  type LearnDiscarded,
  type LearnedItem,
  type Learning,
  type LearnSimilar,
  type Strictness,
  type ProposalSource,
  type ProposalState,
  type ProposeInput,
  type Choices,
  type Design,
  type Level,
  type Mode,
  type Origin,
  type Part,
  type PartParam,
  type Piece,
  type PieceDetail,
  type Analysis,
  type Colour,
  type Draft,
  type DraftReview,
  type ReviewAsk,
  type SceneBatch,
  type SceneApproval,
  type SceneInput,
  type PieceReview,
  type Theme,
  type Verdict,
  type BriefMode,
  type DraftInput,
  type DraftText,
  type PieceState,
  type Reference,
  type ReferenceInput,
  type ReferencePatch,
  type Preset,
  type PresetInput,
  type Proposal,
  type Script,
  type Song,
  type SongMap,
  type StoredDesign,
  type Style,
} from '@lab/animation-core';

type Schemas = components['schemas'];
export type ServerPiece = Schemas['MusicPiece'];
export type ServerCatalog = Schemas['MusicMotionCatalog'];
export type ServerDesign = Schemas['MusicDesign'];
export type ServerStoredDesign = Schemas['MusicDesignStored'];
export type ServerSongMap = Schemas['SongMap'];
export type ServerScript = Schemas['MusicScript'];
export type ServerProposal = Schemas['MusicProposeAnswer'];
export type ServerProposalState = Schemas['MusicProposal'];
export type ServerProposeRequest = Schemas['MusicProposeRequest'];
export type ServerPieceRequest = Schemas['MusicPieceRequest'];
export type ServerReference = Schemas['MotionReference'];
export type ServerPreset = Schemas['MotionPreset'];
export type ServerLearning = Schemas['Learning'];
export type ServerDraft = Schemas['PartDraft'];

/** The songs of `GET /api/library`, as the contract declares them (every field optional). */
export interface ServerLibrarySong {
  key?: string;
  project?: string;
  track_id?: string;
  variant?: number;
  title?: string;
  instrumental?: boolean;
  audio_seconds?: number;
  file?: string;
  cover?: string;
  generated_at?: string;
}

const pick = <T extends string>(allowed: readonly T[], value: string | undefined, fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
const known = <T extends string>(allowed: readonly T[], values: readonly string[]): T[] => values.filter((v): v is T => allowed.includes(v as T));
const time = (iso: string | undefined): number => (iso ? Date.parse(iso) || 0 : 0);

/** The address of a file of a project: the project's artifacts route. */
const artifact = (project: string, file: string): string => `/api/projects/${encodeURIComponent(project)}/artifacts/${file.split('/').map(encodeURIComponent).join('/')}`;

/** A song of the library. One that cannot be told apart (no project or track) is left out. */
export function toSong(s: ServerLibrarySong, urlOf: (address: string) => string): Song | null {
  if (!s.project || !s.track_id) return null;
  const variant = s.variant ?? 0;
  return {
    key: s.key ?? `${s.project}/${s.track_id}/${variant}`,
    project: s.project,
    trackId: s.track_id,
    variant,
    title: s.title?.trim() || s.track_id,
    seconds: s.audio_seconds ?? 0,
    instrumental: s.instrumental === true,
    ...(s.file ? { audio: urlOf(artifact(s.project, s.file)) } : {}),
    ...(s.cover ? { cover: urlOf(artifact(s.project, s.cover)) } : {}),
  };
}

/** The library's songs, newest first (the server lists them so; the order of equal ones is kept). */
export const toSongs = (songs: readonly ServerLibrarySong[], urlOf: (address: string) => string): Song[] =>
  songs.flatMap((s) => {
    const song = toSong(s, urlOf);
    return song ? [song] : [];
  });

function toParam(p: Schemas['MusicParam']): PartParam {
  return {
    name: p.name,
    type: p.type,
    default: p.default,
    ...(p.description ? { description: p.description } : {}),
    ...(p.min !== undefined ? { min: p.min } : {}),
    ...(p.max !== undefined ? { max: p.max } : {}),
    ...(p.max_length !== undefined ? { maxLength: p.max_length } : {}),
    ...(p.options ? { options: p.options } : {}),
    ...(p.animatable ? { animatable: true } : {}),
  };
}

export function toPart(p: Schemas['MusicPart']): Part {
  return {
    name: p.name,
    description: p.description,
    levels: known(LEVELS, p.levels),
    costMs: p.cost_ms,
    manual: p.manual === true,
    ...(p.source ? { source: p.source } : {}),
    ...(p.verse === 'own' ? { verse: 'own' as const } : {}),
    ...(p.hit === 'own' ? { hit: 'own' as const } : {}),
    ...(p.scene ? { scene: { piece: p.scene.piece ?? '', scriptPiece: p.scene.script_piece ?? '' } } : {}),
    params: p.params.map(toParam),
  };
}

export function toCatalog(c: ServerCatalog): Catalog {
  return {
    parts: c.parts.map(toPart),
    characters: c.characters.map((x) => ({ name: x.name, description: x.description, poses: x.poses, expressions: x.expressions })),
    backgrounds: c.backgrounds.map((x) => ({ name: x.name, description: x.description })),
    levels: known(LEVELS, c.levels),
    styles: known(STYLES, c.styles),
    frameRates: c.frame_rates,
    actions: c.actions,
    fonts: c.fonts,
    ...(c.font_stacks ? { fontStacks: { ...c.font_stacks } } : {}),
    ...(c.font_files ? { fontFiles: Object.fromEntries(Object.entries(c.font_files).map(([name, f]) => [name, { family: f.family ?? name, weights: f.weights ?? [], licence: f.licence ?? '' }])) } : {}),
    modes: known(MODES, c.modes),
    // A server that does not say (an older one) supports nothing beyond the base format.
    features: c.features ? [...c.features] : [],
  };
}

export function toDesign(d: ServerDesign): Design {
  return {
    dark: d.dark,
    light: d.light,
    accent: d.accent,
    display: d.display,
    body: d.body,
    defaultMode: pick(MODES, d.default_mode, 'dark'),
    modes: Object.fromEntries(Object.entries(d.modes ?? {}).map(([tag, m]) => [tag, pick(MODES, m, 'dark')])),
    concept: d.concept,
    ...(d.verse_style && d.verse_style !== 'plain' ? { verseStyle: d.verse_style } : {}),
    ...(d.hit_style && d.hit_style !== 'plain' ? { hitStyle: d.hit_style } : {}),
    ...(d.theme ? { theme: toTheme(d.theme) } : {}),
    ...(d.transition_seconds ? { transitionSeconds: d.transition_seconds } : {}),
  };
}

const toTheme = (t: Schemas['MusicTheme']): Theme => ({
  ...(t.css ? { css: t.css } : {}),
  ...(t.assets && Object.keys(t.assets).length ? { assets: { ...t.assets } } : {}),
  ...(t.hud && Object.keys(t.hud).length ? { hud: { ...t.hud } } : {}),
});

/** A theme with nothing in it is not sent, so a design that has none stays as the server has it. */
const fromTheme = (t: Theme): Schemas['MusicTheme'] => ({
  ...(t.css ? { css: t.css } : {}),
  ...(t.assets && Object.keys(t.assets).length ? { assets: { ...t.assets } } : {}),
  ...(t.hud && Object.values(t.hud).some(Boolean) ? { hud: Object.fromEntries(Object.entries(t.hud).filter(([, v]) => v)) } : {}),
});

/** Plain is what the server does when the field is missing, so a plain style is not sent. */
export const fromDesign = (d: Design): ServerDesign => ({
  dark: d.dark,
  light: d.light,
  accent: d.accent,
  display: d.display,
  body: d.body,
  default_mode: d.defaultMode,
  modes: { ...d.modes },
  concept: d.concept,
  ...(d.verseStyle && d.verseStyle !== 'plain' ? { verse_style: d.verseStyle as ServerDesign['verse_style'] } : {}),
  ...(d.hitStyle && d.hitStyle !== 'plain' ? { hit_style: d.hitStyle as ServerDesign['hit_style'] } : {}),
  ...(d.theme && Object.keys(fromTheme(d.theme)).length ? { theme: fromTheme(d.theme) } : {}),
  ...(d.transitionSeconds ? { transition_seconds: d.transitionSeconds } : {}),
});

export function toStoredDesign(d: ServerStoredDesign): StoredDesign {
  return { design: toDesign(d.design), source: d.source, edited: d.edited };
}

export function toSongMap(m: ServerSongMap): SongMap {
  return {
    duration: m.duration,
    bpm: m.bpm,
    beats: m.beats,
    beatBase: m.beat_base ?? 0,
    gridAnchored: m.grid_anchored ?? true,
    sections: m.sections.map((s) => ({ tag: s.tag, start: s.start, end: s.end })),
    words: m.words.map((w) => ({ text: w.text, start: w.start, end: w.end, line: w.line })),
    wordsEstimated: m.words_estimated === true,
    loudnessHop: m.loudness_hop,
    loudness: m.loudness,
  };
}

/** The script is the server's own shape; it is copied so that the caller cannot change what the adapter holds. */
export const toScript = (s: ServerScript): Script => structuredClone(s) as Script;
export const fromScript = (s: Script): ServerScript => structuredClone(s) as ServerScript;

/** A piece for the list. Its video is an address of the server: `urlOf` turns it into one a `<video>` can open. */
export function toPiece(p: ServerPiece, urlOf: (address: string) => string = (a) => a): Piece {
  return {
    id: p.id,
    title: p.title?.trim() || p.id,
    state: p.state satisfies PieceState,
    progress: p.progress,
    source: { project: p.source.project, trackId: p.source.track_id, variant: p.source.variant },
    style: pick<Style>(STYLES, p.style, 'typographic'),
    level: pick<Level>(LEVELS, p.level, 'simple'),
    fps: p.fps,
    width: p.width,
    height: p.height,
    createdAt: time(p.created_at),
    estimate: { seconds: p.estimate?.seconds ?? 0, frames: p.estimate?.frames ?? 0 },
    sizeBytes: p.size_bytes,
    ...(p.video ? { video: urlOf(p.video) } : {}),
    ...(p.error ? { error: p.error } : {}),
  };
}

const originOf = (o: string | undefined): Origin => (o === 'assistant' || o === 'user' ? o : 'fallback');

/** A piece as `GET …/pieces/{id}` answers: with its design, script and song map. Throws when one of them is missing. */
export function toDetail(p: ServerPiece, urlOf: (address: string) => string = (a) => a): PieceDetail {
  if (!p.design || !p.script || !p.song_map) throw new Error(`piece ${p.id} came without its design, script or song map`);
  return { ...toPiece(p, urlOf), design: toStoredDesign(p.design), script: toScript(p.script), scriptSource: originOf(p.script_source), songMap: toSongMap(p.song_map), ...(p.preset ? { preset: p.preset } : {}), ...(p.prompt ? { prompt: p.prompt } : {}), ...(p.proposal ? { proposal: toProposalState(p.proposal) } : {}), ...(p.scenes ? { scenes: toSceneBatch(p.scenes) } : {}), ...(p.review ? { review: toPieceReview(p.review) } : {}), ...(p.words_note ? { notice: p.words_note } : {}), ...(p.script_warning ? { scriptWarning: p.script_warning } : {}) };
}

export const toRequest = (song: Song, choices: Choices, client: string): ServerPieceRequest => ({
  project: song.project,
  track_id: song.trackId,
  variant: song.variant,
  style: choices.style,
  level: choices.level,
  fps: choices.fps as 24 | 30 | 60,
  resolution: choices.resolution,
  client,
  ...(choices.hearWords ? { transcribe: true } : {}),
  ...(choices.presetId ? { preset: choices.presetId } : {}),
  ...(choices.prompt ? { prompt: choices.prompt } : {}),
});

/** The proposal the server answered, with the piece as it is after it (read again by the adapter). */
/** A background proposal as the server reports it; a value this dashboard does not know is kept as it came. */
export function toProposalState(p: ServerProposalState): ProposalState {
  const source = (s: ServerProposalState['design_source'], reason: string | undefined): ProposalSource | undefined => (s ? { source: s, ...(reason ? { reason } : {}) } : undefined);
  const design = source(p.design_source, p.design_fallback_reason);
  const script = source(p.script_source, p.script_fallback_reason);
  const finished = p.finished_at ? Date.parse(p.finished_at) : NaN;
  return {
    state: p.state,
    what: p.what,
    ...(p.model ? { model: p.model } : {}),
    startedAt: Date.parse(p.started_at),
    ...(Number.isFinite(finished) ? { finishedAt: finished } : {}),
    ...(design ? { design } : {}),
    ...(script ? { script } : {}),
    ...(p.error ? { error: p.error } : {}),
  };
}

/** What `propose` sends: the part, the direction and the model; `async` is set by the caller. */
export const fromPropose = (input: ProposeInput, async = false): ServerProposeRequest => ({
  what: input.what,
  ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
  ...(input.model ? { model: input.model } : {}),
  ...(input.provider ? { provider: input.provider } : {}),
  ...(async ? { async: true } : {}),
});

export function toProposal(a: ServerProposal, piece: PieceDetail): Proposal {
  return { what: a.what, source: a.source, ...(a.fallback_reason ? { fallbackReason: a.fallback_reason } : {}), ...(a.model ? { model: a.model } : {}), ...(a.provider ? { provider: a.provider } : {}), replacements: (a.replacements ?? []).map((r) => ({ piece: r.piece, from: r.from, to: r.to })), piece };
}

/** For a name the dashboard shows: the modes the design may hold are the catalog's, which this checks. */
export const isMode = (v: unknown): v is Mode => MODES.includes(v as Mode);


/** The address of a key frame of a reference: its route of the server. */
export const frameAddress = (id: string, name: string): string => `/api/music-motion/references/${encodeURIComponent(id)}/frames/${encodeURIComponent(name)}`;

const toColour = (c: Schemas['MotionColour']): Colour => ({ hex: c.hex, share: c.share });

export function toAnalysis(id: string, a: Schemas['MotionAnalysis'], urlOf: (address: string) => string): Analysis {
  return {
    duration: a.duration,
    fps: a.fps,
    width: a.width,
    height: a.height,
    frames: a.frames.map((name) => urlOf(frameAddress(id, name))),
    colours: a.colours.map(toColour),
    thirds: a.thirds.map((t) => t.map(toColour)),
    cuts: a.cuts,
    meanShot: a.mean_shot,
    ...(a.tempo !== undefined ? { tempo: a.tempo } : {}),
    ...(a.key ? { key: a.key } : {}),
    ...(a.description ? { description: a.description } : {}),
    ...(a.description_note ? { descriptionNote: a.description_note } : {}),
  };
}

export function toReference(r: ServerReference, urlOf: (address: string) => string = (a) => a): Reference {
  return {
    id: r.id,
    title: r.title?.trim() || r.id,
    notes: r.notes ?? '',
    tags: r.tags ?? [],
    ...(r.source ? { source: r.source } : {}),
    state: r.state,
    ...(r.error ? { error: r.error } : {}),
    createdAt: time(r.created_at),
    ...(r.analysis ? { analysis: toAnalysis(r.id, r.analysis, urlOf) } : {}),
  };
}

/** The JSON the server takes to add a reference by address. */
export const fromReferenceInput = (i: ReferenceInput): Schemas['MotionReferenceRequest'] => ({
  ...(i.url?.trim() ? { url: i.url.trim() } : {}),
  ...(i.title?.trim() ? { title: i.title.trim() } : {}),
  ...(i.notes?.trim() ? { notes: i.notes } : {}),
  ...(i.tags?.length ? { tags: [...i.tags] } : {}),
});

/** The form the server takes to add a reference by file; the tags go as a JSON list. */
export function toReferenceForm(i: ReferenceInput): FormData {
  const form = new FormData();
  if (i.file) form.set('file', i.file, i.file.name);
  if (i.title?.trim()) form.set('title', i.title.trim());
  if (i.notes?.trim()) form.set('notes', i.notes);
  if (i.tags?.length) form.set('tags', JSON.stringify(i.tags));
  return form;
}

export const fromReferencePatch = (p: ReferencePatch): Schemas['MotionReferencePatch'] => ({
  ...(p.title !== undefined ? { title: p.title } : {}),
  ...(p.notes !== undefined ? { notes: p.notes } : {}),
  ...(p.tags !== undefined ? { tags: [...p.tags] } : {}),
});

export function toPreset(p: ServerPreset): Preset {
  return {
    id: p.id,
    name: p.name,
    ...(p.reference_id ? { referenceId: p.reference_id } : {}),
    createdAt: time(p.created_at),
    design: toDesign(p.design),
    rhythm: p.rhythm,
    parts: p.parts ?? [],
    adjustments: p.adjustments ?? [],
  };
}

const toSimilar = (s: Schemas['LearnSimilar']): LearnSimilar => ({ kind: s.kind, ...(s.id ? { id: s.id } : {}), name: s.name, distance: s.distance, reason: s.reason });
const toLearned = (i: Schemas['LearnedItem']): LearnedItem => ({ id: i.id, name: i.name, novel: i.novel, ...(i.similar_to ? { similarTo: toSimilar(i.similar_to) } : {}), state: i.state, ...(i.reason ? { reason: i.reason } : {}) });
const toDiscarded = (d: Schemas['LearnDiscarded']): LearnDiscarded => ({ kind: d.kind, name: d.name, ...(d.idea ? { idea: d.idea } : {}), similarTo: toSimilar(d.similar_to), reason: d.reason });

/** What the server answers about a learning, as the model has it. */
export function toLearning(l: ServerLearning): Learning {
  return {
    id: l.id,
    referenceId: l.reference_id,
    state: l.state,
    ...(l.reason ? { reason: l.reason } : {}),
    strictness: l.strictness as Strictness,
    createdAt: time(l.created_at),
    ...(l.finished_at ? { finishedAt: time(l.finished_at) } : {}),
    styles: (l.styles ?? []).map(toLearned),
    partDrafts: (l.part_drafts ?? []).map(toLearned),
    discarded: (l.discarded ?? []).map(toDiscarded),
    skipped: (l.skipped ?? []).map((s) => ({ what: s.what, reason: s.reason })),
  };
}

export const fromPreset = (s: PresetInput): Schemas['MotionPresetPut'] => ({ name: s.name, design: fromDesign(s.design), rhythm: s.rhythm, parts: [...s.parts] });


/** The address of a preview frame of a draft: its route of the server. */
export const previewAddress = (id: string, name: string): string => `/api/music-motion/part-drafts/${encodeURIComponent(id)}/preview/${encodeURIComponent(name)}`;

export function toDraft(d: ServerDraft, urlOf: (address: string) => string = (a) => a): Draft {
  return {
    id: d.id,
    state: d.state,
    request: d.request,
    withPicture: d.with_picture,
    ...(d.source ? { source: d.source } : {}),
    ...(d.description ? { description: d.description } : {}),
    attempts: d.attempts,
    ...(d.name ? { name: d.name } : {}),
    ...(d.replaces ? { replaces: d.replaces } : {}),
    ...(d.model ? { model: d.model } : {}),
    ...(d.provider ? { provider: d.provider } : {}),
    problems: d.problems ?? [],
    ...(d.error ? { error: d.error } : {}),
    createdAt: time(d.created_at),
    preview: (d.preview ?? []).map((name) => urlOf(previewAddress(d.id, name))),
    ...(d.manifest !== undefined ? { manifest: d.manifest } : {}),
    ...(d.fragment !== undefined ? { fragment: d.fragment } : {}),
    ...(d.scene ? { scene: { piece: d.scene.piece ?? '', scriptPiece: d.scene.script_piece ?? '' } } : {}),
    ...(d.brief ? { brief: d.brief } : {}),
    ...(d.review_ask ? { reviewAsk: toReviewAsk(d.review_ask) } : {}),
    ...(d.review ? { review: toDraftReview(d.review) } : {}),
    ...(d.warnings?.length ? { warnings: d.warnings } : {}),
  };
}

const toReviewAsk = (r: { min?: number; attempts?: number }): ReviewAsk => ({ ...(r.min !== undefined ? { min: r.min } : {}), ...(r.attempts !== undefined ? { attempts: r.attempts } : {}) });

const verdict = (v: string | undefined): Verdict | undefined => (v === 'pass' || v === 'weak' || v === 'fail' ? v : undefined);

export const toDraftReview = (r: Schemas['PartDraftReview']): DraftReview => ({
  ...(r.score !== undefined ? { score: r.score } : {}),
  ...(verdict(r.verdict) ? { verdict: verdict(r.verdict) } : {}),
  notes: r.notes ?? [],
  ...(r.model ? { model: r.model } : {}),
  attempts: (r.attempts ?? []).map((a) => ({ ...(a.score !== undefined ? { score: a.score } : {}), ...(a.verdict ? { verdict: a.verdict } : {}), notes: a.notes ?? [] })),
  ...(r.error ? { error: r.error } : {}),
});

export const toSceneBatch = (b: Schemas['MusicSceneBatch']): SceneBatch => ({
  state: b.state,
  done: b.done,
  total: b.total,
  drafts: b.drafts.map((d) => ({ scriptPiece: d.script_piece, ...(d.draft_id ? { draftId: d.draft_id } : {}), state: d.state, ...(d.error ? { error: d.error } : {}) })),
  ...(b.model ? { model: b.model } : {}),
  ...(b.provider ? { provider: b.provider } : {}),
  briefMode: b.brief_mode === 'literal' ? 'literal' : ('metaphor' as BriefMode),
  ...(b.review ? { review: toReviewAsk(b.review) } : {}),
  ...(b.error ? { error: b.error } : {}),
});

export const toPieceReview = (r: Schemas['MusicPieceReview']): PieceReview => ({
  state: r.state,
  ...(r.model ? { model: r.model } : {}),
  scenes: r.scenes.map((s) => ({ scriptPiece: s.script_piece, score: s.score, ...(verdict(s.verdict) ? { verdict: verdict(s.verdict) } : {}), notes: s.notes ?? [], ...(s.error ? { error: s.error } : {}) })),
  ...(r.overall ? { overall: { ...(r.overall.score !== undefined ? { score: r.overall.score } : {}), notes: r.overall.notes ?? [], repeated: r.overall.repeated ?? [], ...(r.overall.error ? { error: r.overall.error } : {}) } } : {}),
  ...(r.error ? { error: r.error } : {}),
});

export const fromSceneInput = (i: SceneInput): Record<string, unknown> => ({
  ...(i.scriptPieces?.length ? { script_pieces: [...i.scriptPieces] } : {}),
  ...(i.briefMode ? { brief_mode: i.briefMode } : {}),
  ...(i.model ? { model: i.model } : {}),
  ...(i.provider ? { provider: i.provider } : {}),
  ...(i.review !== undefined ? { review: i.review } : {}),
});

export const toSceneApproval = (a: { approved: { script_piece?: string; part?: string; draft_id?: string }[]; not_approved: { script_piece?: string; draft_id?: string; state?: string; error?: string }[]; script: ServerScript }): SceneApproval => ({
  approved: a.approved.map((x) => ({ scriptPiece: x.script_piece ?? '', part: x.part ?? '', draftId: x.draft_id ?? '' })),
  notApproved: a.not_approved.map((x) => ({ scriptPiece: x.script_piece ?? '', draftId: x.draft_id ?? '', state: x.state ?? '', ...(x.error ? { error: x.error } : {}) })),
  script: toScript(a.script),
});

/** The JSON the server takes to ask for a part with no picture or with a frame of a reference. */
export const fromDraftInput = (i: DraftInput): Schemas['PartDraftRequest'] => ({
  ...(i.request.trim() || !i.scene ? { request: i.request.trim() } : {}),
  ...(i.scene ? { scene: { piece: i.scene.piece, script_piece: i.scene.scriptPiece, ...(i.scene.brief ? { brief: i.scene.brief } : {}) } } : {}),
  ...(i.review !== undefined ? { review: i.review } : {}),
  ...(i.referenceId ? { reference_id: i.referenceId } : {}),
  ...(i.frame ? { frame: i.frame } : {}),
  ...(i.base ? { manifest: i.base.manifest, fragment: i.base.fragment } : {}),
  ...(i.model ? { model: i.model } : {}),
  ...(i.provider ? { provider: i.provider } : {}),
});

/** The form the server takes to ask for a part with an uploaded picture. */
export function toDraftForm(i: DraftInput): FormData {
  const form = new FormData();
  form.set('request', i.request.trim());
  if (i.file) form.set('file', i.file, i.file.name);
  if (i.model) form.set('model', i.model);
  if (i.provider) form.set('provider', i.provider);
  return form;
}

export const fromDraftText = (t: DraftText): Schemas['PartDraftPut'] => ({ manifest: t.manifest, fragment: t.fragment });

/** The installed models of the assistant, as the server lists them. */
export const toAssistModels = (a: { default?: string; models?: { name?: string; size_bytes?: number; fits?: boolean }[] }): AssistModels => ({
  default: a.default ?? '',
  models: (a.models ?? []).filter((m) => !!m.name).map((m) => ({ name: m.name as string, sizeBytes: m.size_bytes ?? 0, fits: m.fits !== false })),
});

/** What `plan` sends: the sentence, and the generator, the language, the provider and the model only when given. */
export const fromPlanInput = (i: PlanInput): { text: string; generator?: string; language?: string; model?: string; provider?: string } => ({
  text: i.text.trim(),
  ...(i.generator ? { generator: i.generator } : {}),
  ...(i.language ? { language: i.language } : {}),
  ...(i.model ? { model: i.model } : {}),
  ...(i.provider ? { provider: i.provider } : {}),
});

/** The plan the server answered: every field present, empty or zero when the server left it out. */
export function toAssistedPlan(a: {
  song?: { title?: string; caption?: string; lyrics?: string; tags?: string; instrumental?: boolean; seconds?: number };
  animation?: { style?: string; level?: string; fps?: number; mode?: string; concept?: string; prompt?: string };
  parts?: { name: string; exists: boolean; request?: string }[];
  warnings?: string[];
}): AssistedPlan {
  const song = a.song ?? {};
  const animation = a.animation ?? {};
  return {
    song: { title: song.title ?? '', caption: song.caption ?? '', lyrics: song.lyrics ?? '', tags: song.tags ?? '', instrumental: song.instrumental === true, seconds: song.seconds ?? 0 },
    animation: { style: animation.style ?? '', level: animation.level ?? '', fps: animation.fps ?? 0, mode: animation.mode ?? '', concept: animation.concept ?? '', prompt: animation.prompt ?? '' },
    parts: (a.parts ?? []).map((p) => ({ name: p.name, exists: p.exists, ...(p.request ? { request: p.request } : {}) })),
    warnings: a.warnings ?? [],
  };
}
