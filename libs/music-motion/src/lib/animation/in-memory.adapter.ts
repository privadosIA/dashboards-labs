import { Observable, defer, of, throwError, timer } from 'rxjs';
import { distinctUntilChanged, filter, map, switchMap, takeWhile } from 'rxjs/operators';
import { BehaviorSubject } from 'rxjs';

import { AnimationFailure, FEATURE_PLAN, FEATURE_SVG, MAX_PLAN_TEXT, MAX_SVG_TEXT, hasAnimateFeature, hasLayersFeature, isBusy, STRICTNESSES, isFinished, isProposing, keyframeProblem, layerProblems, MAX_PROMPT, MAX_RHYTHM, MIN_RHYTHM, pictureLost, type Analysis, type Animate, type AnimationPort, type LearnDiscarded, type Learning, type LearnSimilar, type LearnSkipped, type Strictness, type AssistModels, type Catalog, type Choices, type Design, type Draft, type DraftInput, type DraftText, type Estimate, type Part, type PartText, type Piece, type PieceDetail, type PieceState, type Preset, type PresetInput, type Proposal, type ProposalState, type ProposeInput, type Reference, type ReferenceInput, type ReferencePatch, type Script, type Song, type SvgInput, type AssistedPlan, type PlanInput, type SceneBatch, type SceneInput, type SceneApproval, type PieceReview, type DraftReview, type ReviewAsk, type ScriptPiece, type Theme, FEATURE_SCENE, FEATURE_THEME, FEATURE_REVIEW, REVIEW_ATTEMPTS_MAX, SCENE_BRIEF_MAX, THEME_ASSET_BYTES, THEME_ASSET_NAME, THEME_ASSETS_MAX, THEME_CSS_MAX, THEME_HUD_MAX, TRANSITION_MAX, verdictOf } from '@lab/animation-core';
import { BUILT_IN_DATASET, type Dataset, type DatasetVideo } from './dataset';
import { PALETTES, SONGS, fixtureSong, plannedFrom, frameOf, memoryCatalog, paramsOfManifest, scriptOf, songMapOf, svgOf, withOwnParts, type FixtureSong } from './fixtures';
import { validateChoices, validateDraftInput, validateReferenceInput } from './validate';

const HEX = /^#[0-9a-fA-F]{6}$/;
const RUN_STEPS = 8;

type Base = Omit<PieceDetail, 'state' | 'progress' | 'estimate' | 'video' | 'error' | 'sizeBytes' | 'notice' | 'scriptWarning' | 'proposal' | 'scenes' | 'review'>;

/** A proposal for both design and script that the adapter writes by its clock: waiting, writing, then done. What it decided is applied when it is read as done. */
interface StoredProposal {
  startedAt: number;
  model: string;
  /** Milliseconds it waits for a run to end, and then writes. */
  waitMs: number;
  writeMs: number;
  /** Why the fixed rule answered; the same for the design and the script. */
  reason: string;
  applied: boolean;
}

/** The models the in-memory assistant offers, like a server with a small and a large one installed. */
const MODELS = { default: 'qwen3:8b', models: [{ name: 'qwen3:8b', sizeBytes: 5_200_000_000, fits: true }, { name: 'gemma4:26b', sizeBytes: 17_000_000_000, fits: false }] };
const NO_ASSISTANT = 'there is no assistant in the in-memory mode, so the fixed rule wrote it.';
const NOT_READ = ' The fixed rule does not read the prompt.';
/** What the adapter keeps of a piece: the parts that can change are not read-only here. */
type Stored = { -readonly [K in keyof Base]: Base[K] } & {
  renderedAt?: number;
  /** The address of the video and its size, for the piece of the sample, whose video is a file the app serves. */
  sampleVideo?: { address: string; bytes: number };
  /** Why the render failed, for a piece of a dataset that did. */
  failure?: string;
  proposal?: StoredProposal;
  batch?: StoredBatch;
  review?: StoredReview;
};

export interface InMemoryOptions {
  /** Milliseconds a proposal for both design and script waits for a run to end before it writes. None by default. */
  waitMs?: number;
  /** Whether there are models to choose from: with `missing` listing them is refused as a server with no assistant does. */
  assistant?: 'available' | 'missing';
  /** Where the pieces are kept so that a reload (a change of language) does not lose them. Nothing is kept without it. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Milliseconds of one step of a render: one queued, then eight running. */
  stepMs?: number;
  /** Milliseconds between two reads of a piece that is being followed. */
  pollMs?: number;
  /** Milliseconds the server takes to hear the words of a song. */
  transcribeMs?: number;
  /** Milliseconds a part takes to be written. */
  writeMs?: number;
  /** Milliseconds a reference takes to be analysed. */
  analyseMs?: number;
  /** Whether Whisper is installed here: with `missing` hearing the words is refused as the server does. */
  whisper?: 'available' | 'missing';
  /** What this server's scripts support beyond the base format. `['animate', 'layers']` by default; `[]` is a server that takes neither. */
  features?: readonly string[];
  now?: () => number;
}

const KEY = 'video-anim.memory';

/** What the adapter keeps of a reference; what is read of it (its state, its analysis) comes from the clock. */
interface StoredReference {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  source?: string;
  createdAt: number;
  /** `ok`; `nodesc` is analysed with no description; `broken` fails. The address says which (see `kindOf`). */
  kind: 'ok' | 'nodesc' | 'broken';
}

/** What the adapter keeps of a learning: what it made and dropped, fixed when it started; its state and what became of its items come from the clock and the stores. */
interface StoredLearning {
  id: string;
  referenceId: string;
  strictness: Strictness;
  createdAt: number;
  style?: { id: string; name: string; similarTo?: LearnSimilar };
  drafts: { id: string; name: string; similarTo?: LearnSimilar }[];
  discarded: LearnDiscarded[];
  skipped: LearnSkipped[];
}

/** How far from what exists a proposal has to be, by strictness: below it the proposal is dropped as too similar. */
const LEARN_THRESHOLD: Record<Strictness, number> = { low: 0.2, normal: 0.4, high: 0.6 };
/** The part ideas a learning of the in-memory adapter has, with how far each is from the closest part of the catalog. */
const LEARN_IDEAS: readonly { idea: string; closest: string; distance: number }[] = [
  { idea: 'a counter that climbs with the loudness', closest: 'counter', distance: 0.35 },
  { idea: 'a strip of colour swatches that scrolls', closest: 'ticker-tape', distance: 0.5 },
  { idea: 'a title that flickers like a neon sign', closest: 'toggle', distance: 0.7 },
];

/** What the adapter keeps of a draft; what is read of it (its state, its name) comes from the clock. `kind` says how it ends: see `askDraft`. */
interface StoredDraft {
  id: string;
  request: string;
  withPicture: boolean;
  source?: string;
  description?: string;
  createdAt: number;
  attempts: number;
  /** `invalid` is a draft made from a text that did not pass: it is `failed` with its problems and the text, to be fixed by saving it. */
  kind: 'ok' | 'minor' | 'fail' | 'clash' | 'problems' | 'invalid';
  manifest: string;
  fragment: string;
  problems?: string[];
  /** The part whose text the draft was asked to change. */
  replaces?: string;
  /** The model chosen to write it. */
  model?: string;
  /** The script piece this draft is a scene for. */
  scene?: { piece: string; scriptPiece: string };
  brief?: string;
  review?: ReviewAsk | true;
}

/** A batch of scenes: the drafts are made when it starts and each is written in its turn by the clock (the first at `startedAt`, the next `writeMs` later). */
interface StoredBatch {
  startedAt: number;
  briefMode: 'metaphor' | 'literal';
  model?: string;
  provider?: string;
  review?: ReviewAsk;
  items: { scriptPiece: string; draftId: string }[];
  cancelledAt?: number;
}

/** A review of a piece, which ends by the clock. */
interface StoredReview {
  startedAt: number;
  model: string;
}

/** The name a manifest text gives, when it is JSON with one. */
const nameOf = (manifest: string): string | undefined => {
  try {
    const name = (JSON.parse(manifest) as { name?: unknown }).name;
    return typeof name === 'string' && name.trim() ? name : undefined;
  } catch {
    return undefined;
  }
};

const YOUTUBE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i;
const COLOURS = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a'];


const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * A port that works with no server: the songs and the catalog of `fixtures.ts`, pieces made complete at once by the fixed
 * rule, the refusals and the busy answers the server gives (simplified), and a render that goes by the clock: one step
 * queued, eight running, then done. It is what the tests of the screens run on.
 */
export class InMemoryAnimation implements AnimationPort {
  private readonly records = new Map<string, Stored>();
  private readonly list = new BehaviorSubject<readonly Piece[]>([]);
  private readonly storage?: InMemoryOptions['storage'];
  private readonly stepMs: number;
  private readonly pollMs: number;
  private readonly transcribeMs: number;
  private readonly analyseMs: number;
  private readonly writeMs: number;
  private readonly draftsById = new Map<string, StoredDraft>();
  private readonly draftList = new BehaviorSubject<readonly Draft[]>([]);
  private draftCounter = 0;
  /** The catalog, which grows with the parts that are approved. */
  private catalogNow: Catalog;
  private readonly features: readonly string[];
  private readonly refs = new Map<string, StoredReference>();
  private readonly presetsById = new Map<string, Preset>();
  private readonly learningsById = new Map<string, StoredLearning>();
  private learnCounter = 0;
  private readonly refList = new BehaviorSubject<readonly Reference[]>([]);
  private refCounter = 0;
  private readonly whisper: 'available' | 'missing';
  private readonly waitMs: number;
  private readonly assistant: 'available' | 'missing';
  private readonly now: () => number;
  private counter = 0;
  /** The songs datasets brought, which join the library's. */
  private extraSongs: FixtureSong[] = [];

  constructor({ storage, stepMs = 600, pollMs = 500, transcribeMs = 800, analyseMs = 1500, writeMs = 2000, whisper = 'available', features = ['animate', 'layers', 'svg', 'plan', 'scene', 'theme', 'review'], waitMs = 0, assistant = 'available', now = () => Date.now() }: InMemoryOptions = {}) {
    this.storage = storage;
    this.features = features;
    this.catalogNow = memoryCatalog(features);
    this.stepMs = stepMs;
    this.pollMs = pollMs;
    this.transcribeMs = transcribeMs;
    this.analyseMs = analyseMs;
    this.writeMs = writeMs;
    this.whisper = whisper;
    this.waitMs = waitMs;
    this.assistant = assistant;
    this.now = now;
    this.load();
  }

  songs(): Observable<readonly Song[]> {
    return defer(() => of(this.librarySongs().map(({ key, project, trackId, variant, title, seconds, instrumental, audio }) => ({ key, project, trackId, variant, title, seconds, instrumental, ...(audio ? { audio } : {}) }))));
  }

  /**
   * Adds a song made elsewhere in memory mode (the music studio's in-memory port) to the library, so `songs()` lists it and a piece can be made
   * from it. It plays the sample's media unless the caller gives an address; adding the same key again replaces it.
   */
  addSong(song: { project: string; trackId?: string; variant?: number; title: string; seconds: number; instrumental: boolean; lyrics?: string; bpm?: number; audio?: string }): Observable<Song> {
    return defer(() => {
      const added: FixtureSong = {
        key: `${song.project}/${song.trackId ?? 'track-1'}/${song.variant ?? 0}`,
        project: song.project,
        trackId: song.trackId ?? 'track-1',
        variant: song.variant ?? 0,
        title: song.title,
        seconds: song.seconds,
        instrumental: song.instrumental,
        lyrics: song.lyrics ?? '',
        bpm: song.bpm ?? 100,
        audio: song.audio ?? BUILT_IN_DATASET.video.address,
      };
      this.extraSongs = [...this.extraSongs.filter((x) => x.key !== added.key), added];
      this.changed();
      return of({ key: added.key, project: added.project, trackId: added.trackId, variant: added.variant, title: added.title, seconds: added.seconds, instrumental: added.instrumental, audio: added.audio });
    });
  }

  /** The songs of the library: the fixed ones and the ones datasets brought. */
  private librarySongs(): readonly FixtureSong[] {
    return this.extraSongs.length ? [...SONGS, ...this.extraSongs] : SONGS;
  }

  /** Puts the built-in dataset in (see `loadDataset`). */
  /** The text of the parts of the user's that came with a dataset or were approved here: what `partText` answers. */
  private readonly partTexts = new Map<string, PartText>();

  loadSample(): Observable<void> {
    return this.loadDataset(BUILT_IN_DATASET);
  }

  /**
   * Puts a dataset in: its songs, its pieces in their states (a finished one plays the dataset's video), its references (ready), the
   * styles made from them and its parts (approved). An item whose id is already there is replaced by the dataset's; the rest, and
   * what the person made, are left alone. Loading the same dataset again changes nothing. The dataset must be valid (see
   * `validateDataset`): this does not check it again.
   */
  loadDataset(data: Dataset, video: DatasetVideo | undefined = data.video ?? BUILT_IN_DATASET.video): Observable<void> {
    return defer(() => {
      const now = this.now();
      for (const s of data.songs ?? []) {
        const plays = video !== undefined && (data.pieces ?? []).some((p) => p.state === 'done' && p.song.project === s.project && p.song.trackId === s.trackId && p.song.variant === s.variant);
        const song = { ...fixtureSong(s), ...(plays ? { audio: video.address } : {}) };
        this.extraSongs = [...this.extraSongs.filter((x) => x.key !== song.key), song];
      }
      // The first piece of a dataset draws with its own parts that carry their text, so its preview shows real fragments.
      const ownNames = (data.parts ?? []).filter((x) => x.manifest && x.fragment).map((x) => x.name);
      (data.pieces ?? []).forEach((p, i) => {
        const song = this.librarySongs().find((s) => s.project === p.song.project && s.trackId === p.song.trackId && s.variant === p.song.variant);
        if (!song) return;
        const songMap = songMapOf(song);
        const [width, height] = p.resolution.split('x').map(Number);
        const design = PALETTES[song.bpm >= 110 ? 1 : 0];
        this.records.set(p.id, {
          id: p.id,
          title: song.title,
          source: { project: song.project, trackId: song.trackId, variant: song.variant },
          style: p.style,
          level: p.level,
          fps: p.fps,
          width,
          height,
          createdAt: now - i * 60_000,
          design: { design, source: 'fallback', edited: false },
          script: i === 0 ? withOwnParts(scriptOf(songMap, p.level, design), ownNames) : scriptOf(songMap, p.level, design),
          scriptSource: 'fallback',
          songMap,
          ...(p.state === 'done' ? { renderedAt: 1, ...(video ? { sampleVideo: { address: video.address, bytes: video.bytes } } : {}) } : {}),
          ...(p.state === 'failed' ? { failure: p.error ?? 'the render failed' } : {}),
        });
      });
      (data.references ?? []).forEach((r, i) => {
        this.refs.set(r.id, { id: r.id, title: r.title, notes: r.notes, tags: [...r.tags], source: r.source, createdAt: now - this.analyseMs - 1 - i * 1000, kind: 'ok' });
      });
      for (const p of data.presets ?? []) {
        const record = this.refs.get(p.referenceId);
        if (record) this.presetsById.set(p.id, this.presetFrom(this.readReference(record), p.id, p.name));
      }
      for (const p of data.parts ?? []) {
        const part: Part = { name: p.name, description: p.description, levels: [...this.catalogNow.levels], costMs: 60, manual: false, source: 'user', params: paramsOfManifest(p.manifest) };
        this.catalogNow = { ...this.catalogNow, parts: [...this.catalogNow.parts.filter((x) => x.name !== p.name), part] };
        if (p.manifest && p.fragment) this.partTexts.set(p.name, { name: p.name, manifest: JSON.stringify(p.manifest), fragment: p.fragment });
      }
      this.changed();
      return of(undefined);
    });
  }

  catalog(piece?: string): Observable<Catalog> {
    return defer(() => of(this.visibleCatalog(piece)));
  }

  /** The catalog as the server lists it: the scenes written for the verses of a piece are out of it unless that piece is asked for. */
  private visibleCatalog(piece?: string): Catalog {
    return { ...this.catalogNow, parts: this.catalogNow.parts.filter((p) => !p.scene || p.scene.piece === piece) };
  }

  pieces(): Observable<readonly Piece[]> {
    return defer(() => {
      this.publish();
      return this.list.asObservable();
    });
  }

  piece(id: string): Observable<PieceDetail> {
    return defer(() => this.find(id).pipe(map((r) => this.detail(r))));
  }

  create(song: Song, choices: Choices): Observable<PieceDetail> {
    return defer(() => {
      const problems = validateChoices(choices);
      if (problems.length) return throwError(() => new AnimationFailure('refused', `these choices are not accepted: ${problems.join(', ')}`));
      const source = this.librarySongs().find((s) => s.project === song.project && s.trackId === song.trackId && s.variant === song.variant);
      if (!source) return throwError(() => new AnimationFailure('refused', `the song ${song.project}/${song.trackId} version ${song.variant} is unknown`));
      const preset = choices.presetId ? this.presetsById.get(choices.presetId) : undefined;
      if (choices.presetId && !preset) return throwError(() => new AnimationFailure('refused', `preset "${choices.presetId}" does not exist`));
      const songMap = songMapOf(source);
      const design = preset ? structuredClone(preset.design) : PALETTES[source.bpm >= 110 ? 1 : 0];
      const [width, height] = choices.resolution.split('x').map(Number);
      const id = `api-mm-${++this.counter}-${this.now().toString(36)}`;
      const record: Stored = {
        id,
        title: source.title,
        source: { project: source.project, trackId: source.trackId, variant: source.variant },
        style: choices.style,
        level: choices.level,
        fps: choices.fps,
        width,
        height,
        createdAt: this.now(),
        design: { design, source: preset ? 'user' : 'fallback', edited: false },
        script: scriptOf(songMap, choices.level, design, preset?.parts),
        scriptSource: 'fallback',
        songMap,
        ...(preset ? { preset: preset.id } : {}),
        ...(choices.prompt ? { prompt: choices.prompt } : {}),
      };
      this.records.set(id, record);
      let notice: string | undefined;
      if (choices.hearWords) {
        const problem = this.hearProblem(record, source.instrumental);
        if (problem) notice = problem;
        else this.hear(record);
      }
      this.changed();
      return of(this.detail(record, notice ? { notice } : {}));
    });
  }

  saveDesign(id: string, design: Design): Observable<PieceDetail> {
    return defer(() =>
      this.idle(id).pipe(
        map((r) => {
          const problem = this.designProblem(design);
          if (problem) throw new AnimationFailure('refused', problem);
          r.design = { design: structuredClone(design), source: 'user', edited: true };
          this.changed();
          return this.detail(r);
        }),
      ),
    );
  }

  saveScript(id: string, script: Script): Observable<PieceDetail> {
    return defer(() =>
      this.idle(id).pipe(
        map((r) => {
          const problem = this.scriptProblem(script, r.songMap.duration);
          if (problem) throw new AnimationFailure('refused', problem);
          r.script = structuredClone(script);
          r.scriptSource = 'user';
          this.changed();
          return this.detail(r);
        }),
      ),
    );
  }

  propose(id: string, input: ProposeInput & { readonly what: 'design' | 'script' }): Observable<Proposal> {
    return defer(() =>
      this.idle(id).pipe(
        map((r) => {
          const problem = this.promptProblem(input.prompt);
          if (problem) throw new AnimationFailure('refused', problem);
          if (input.prompt !== undefined) r.prompt = input.prompt || undefined;
          // The fixed rule answers: there is no assistant here, which is not an error. It says why, and that it did not read the prompt.
          if (input.what === 'design') this.writeDesign(r);
          else this.writeScript(r);
          this.changed();
          const reason = NO_ASSISTANT + (r.prompt ? NOT_READ : '');
          return { what: input.what, source: 'fallback' as const, fallbackReason: reason, ...(input.model ? { model: input.model } : {}), replacements: [], piece: this.detail(r) };
        }),
      ),
    );
  }

  proposeAll(id: string, input: Omit<ProposeInput, 'what'>): Observable<PieceDetail> {
    return defer(() =>
      this.idle(id).pipe(
        map((r) => {
          const problem = this.promptProblem(input.prompt);
          if (problem) throw new AnimationFailure('refused', problem);
          if (input.prompt !== undefined) r.prompt = input.prompt || undefined;
          r.proposal = { startedAt: this.now(), model: input.model || MODELS.default, waitMs: this.waitMs, writeMs: this.writeMs, reason: NO_ASSISTANT + (r.prompt ? NOT_READ : ''), applied: false };
          this.changed();
          return this.detail(r);
        }),
      ),
    );
  }

  followProposal(id: string): Observable<PieceDetail> {
    return defer(() =>
      timer(0, this.pollMs).pipe(
        switchMap(() => this.find(id).pipe(map((r) => this.detail(r)))),
        distinctUntilChanged((a, b) => JSON.stringify(a.proposal) === JSON.stringify(b.proposal)),
        takeWhile((piece) => isProposing(piece), true),
      ),
    );
  }

  // ---------------------------------------------------------------- scenes and reviews

  writeScenes(id: string, input: SceneInput = {}): Observable<SceneBatch> {
    return defer(() => {
      if (!this.features.includes(FEATURE_SCENE)) return throwError(() => new AnimationFailure('unavailable', 'this server has no scenes'));
      if (this.assistant === 'missing') return throwError(() => new AnimationFailure('unavailable', 'there is no assistant'));
      return this.idle(id).pipe(
        map((r) => {
          if (r.batch && this.batchOf(r).state === 'writing') throw new AnimationFailure('busy', `piece "${id}" is writing a batch of scenes: wait for it to end or stop it`);
          if (!r.script.pieces.length) throw new AnimationFailure('refused', `piece "${id}" has no script`);
          const wanted = input.scriptPieces?.length ? input.scriptPieces : r.script.pieces.map((p) => p.id);
          const missing = wanted.find((w) => !r.script.pieces.some((p) => p.id === w));
          if (missing) throw new AnimationFailure('missing', `piece "${id}" has no script piece "${missing}"`);
          if (input.model && !MODELS.models.some((m) => m.name === input.model)) throw new AnimationFailure('refused', `the model "${input.model}" is not installed`);
          const review = input.review && this.features.includes(FEATURE_REVIEW) ? (input.review === true ? {} : { ...input.review }) : undefined;
          const startedAt = this.now();
          const items = wanted.map((scriptPiece, i) => {
            const piece = r.script.pieces.find((p) => p.id === scriptPiece)!;
            const draft = this.makeSceneDraft(r, piece, '', input.briefMode === 'literal' ? piece.lines?.map((l) => l.text).join(' ') ?? '' : '', startedAt + i * this.writeMs, input.model, review ?? undefined);
            return { scriptPiece, draftId: draft.id };
          });
          r.batch = { startedAt, briefMode: input.briefMode ?? 'metaphor', ...(input.model ? { model: input.model } : {}), ...(input.provider ? { provider: input.provider } : {}), ...(review ? { review } : {}), items };
          this.changed();
          return this.batchOf(r);
        }),
      );
    });
  }

  /** The batch as the clock says it is now: each draft is pending until its turn, writing for `writeMs`, then ready; one that was approved is gone. */
  private batchOf(r: Stored): SceneBatch {
    const b = r.batch!;
    const drafts = b.items.map((item) => {
      const d = this.draftsById.get(item.draftId);
      if (!d) return { scriptPiece: item.scriptPiece, state: 'approved' as const };
      if (b.cancelledAt !== undefined && d.createdAt > b.cancelledAt) return { scriptPiece: item.scriptPiece, state: 'pending' as const };
      if (this.now() < d.createdAt) return { scriptPiece: item.scriptPiece, state: 'pending' as const };
      const state = this.draftState(d);
      return { scriptPiece: item.scriptPiece, draftId: item.draftId, state, ...(state === 'failed' ? { error: 'the assistant could not write a scene that passes the checks' } : {}) };
    });
    const done = drafts.filter((d) => d.state === 'ready' || d.state === 'failed' || d.state === 'approved').length;
    const cancelled = b.cancelledAt !== undefined;
    const state = cancelled ? (drafts.some((d) => d.state === 'writing') ? 'writing' : 'cancelled') : done === drafts.length ? 'done' : 'writing';
    return { state, done, total: drafts.length, drafts, ...(b.model ? { model: b.model } : {}), ...(b.provider ? { provider: b.provider } : {}), briefMode: b.briefMode, ...(b.review ? { review: { ...b.review } } : {}) };
  }

  followScenes(id: string): Observable<SceneBatch> {
    const same = (a: SceneBatch, b: SceneBatch): boolean => JSON.stringify(a) === JSON.stringify(b);
    return defer(() =>
      timer(0, this.pollMs).pipe(
        switchMap(() => this.find(id)),
        map((r) => (r.batch ? this.batchOf(r) : undefined)),
        filter((b): b is SceneBatch => !!b),
        distinctUntilChanged(same),
        takeWhile((b) => b.state === 'writing', true),
      ),
    );
  }

  cancelScenes(id: string): Observable<SceneBatch> {
    return defer(() =>
      this.find(id).pipe(
        map((r) => {
          if (!r.batch) throw new AnimationFailure('missing', `piece "${id}" has no batch of scenes`);
          r.batch.cancelledAt ??= this.now();
          this.changed();
          return this.batchOf(r);
        }),
      ),
    );
  }

  approveScenes(id: string): Observable<SceneApproval> {
    return defer(() =>
      this.idle(id).pipe(
        map((r) => {
          if (!r.batch) throw new AnimationFailure('missing', `piece "${id}" has no batch of scenes`);
          const batch = this.batchOf(r);
          if (batch.state === 'writing') throw new AnimationFailure('busy', `the batch of piece "${id}" is still being written`);
          const gone = batch.drafts.find((d) => !r.script.pieces.some((p) => p.id === d.scriptPiece));
          if (gone) throw new AnimationFailure('refused', `script piece "${gone.scriptPiece}" is not in the script any more: the scenes were written for another one`);
          const approved: SceneApproval['approved'][number][] = [];
          const notApproved: SceneApproval['notApproved'][number][] = [];
          const pieces = r.script.pieces.map((p) => ({ ...p }));
          for (const d of batch.drafts) {
            if (d.state !== 'ready' || !d.draftId) {
              if (d.state !== 'approved' && d.state !== 'pending') notApproved.push({ scriptPiece: d.scriptPiece, draftId: d.draftId ?? '', state: d.state, ...(d.error ? { error: d.error } : {}) });
              continue;
            }
            const stored = this.draftsById.get(d.draftId)!;
            const manifest = JSON.parse(stored.manifest) as { name: string; description?: string; params?: unknown };
            const part: Part = { name: manifest.name, description: manifest.description ?? '', levels: [...this.catalogNow.levels], costMs: 60, manual: false, source: 'user', verse: 'own', scene: { piece: r.id, scriptPiece: d.scriptPiece }, params: [] };
            this.catalogNow = { ...this.catalogNow, parts: [...this.catalogNow.parts.filter((x) => x.name !== part.name), part] };
            this.partTexts.set(part.name, { name: part.name, manifest: stored.manifest, fragment: stored.fragment });
            this.draftsById.delete(d.draftId);
            const target = pieces.find((p) => p.id === d.scriptPiece)!;
            target.part = part.name;
            delete (target as { params?: unknown }).params;
            delete (target as { animate?: unknown }).animate;
            approved.push({ scriptPiece: d.scriptPiece, part: part.name, draftId: d.draftId });
          }
          r.script = { ...r.script, pieces };
          r.scriptSource = 'user';
          this.changed();
          return { approved, notApproved, script: structuredClone(r.script) };
        }),
      ),
    );
  }

  reviewPiece(id: string): Observable<PieceReview> {
    return defer(() => {
      if (!this.features.includes(FEATURE_REVIEW)) return throwError(() => new AnimationFailure('unavailable', 'this server cannot review a piece'));
      return this.idle(id).pipe(
        map((r) => {
          if (r.review && this.reviewOf(r).state === 'running') throw new AnimationFailure('busy', `piece "${id}" is being reviewed`);
          if (r.batch && this.batchOf(r).state === 'writing') throw new AnimationFailure('busy', `piece "${id}" is writing a batch of scenes`);
          r.review = { startedAt: this.now(), model: 'gemma4:26b' };
          this.changed();
          return this.reviewOf(r);
        }),
      );
    });
  }

  /** The review as the clock says it is now: running for two render steps, then done, with a score for each script piece worked out by a rule (the length of its words) and two fixed notes. */
  private reviewOf(r: Stored): PieceReview {
    const v = r.review!;
    if (this.now() - v.startedAt < this.stepMs * 2) return { state: 'running', model: v.model, scenes: [] };
    const scenes = r.script.pieces.map((p) => {
      const score = 3 + ((p.lines ?? []).map((l) => l.text ?? '').join(' ').length % 7);
      return { scriptPiece: p.id, score, verdict: verdictOf(score), notes: score >= 7 ? [] : ['The keyword is not the biggest thing on the frame.', 'Two accents compete.'] };
    });
    const mean = scenes.length ? Math.round(scenes.reduce((a, s) => a + s.score, 0) / scenes.length) : 0;
    return { state: 'done', model: v.model, scenes, overall: { score: mean, notes: ['Type and palette are consistent.', 'Two scenes use the same metaphor.'], repeated: scenes.length > 3 ? [[scenes[0].scriptPiece, scenes[2].scriptPiece]] : [] } };
  }

  followReview(id: string): Observable<PieceReview> {
    const same = (a: PieceReview, b: PieceReview): boolean => JSON.stringify(a) === JSON.stringify(b);
    return defer(() =>
      timer(0, this.pollMs).pipe(
        switchMap(() => this.find(id)),
        map((r) => (r.review ? this.reviewOf(r) : undefined)),
        filter((b): b is PieceReview => !!b),
        distinctUntilChanged(same),
        takeWhile((b) => b.state === 'running', true),
      ),
    );
  }

  assistModels(): Observable<AssistModels> {
    return defer(() => (this.assistant === 'missing' ? throwError(() => new AnimationFailure('unavailable', 'no assistant is configured')) : of(structuredClone(MODELS))));
  }

  /**
   * A drawing chosen by a word of the description (`circle`, `bars`, `logo`, else a square), after `writeMs`. It refuses an empty text, one over
   * `MAX_SVG_TEXT` and `notsvg` (an answer that is not an SVG), is `unavailable` with no assistant, for a model that is not installed or when it does
   * not list the `svg` feature (a server that lacks the operation).
   */
  writeSvg(input: SvgInput): Observable<string> {
    return defer(() => {
      const text = input.text.trim();
      if (!this.features.includes(FEATURE_SVG) || this.assistant === 'missing') return throwError(() => new AnimationFailure('unavailable', 'there is no assistant to write a drawing'));
      if (!text) return throwError(() => new AnimationFailure('refused', 'the description is empty'));
      if ([...text].length > MAX_SVG_TEXT) return throwError(() => new AnimationFailure('refused', `the description is longer than ${MAX_SVG_TEXT} characters`));
      if (input.model && !MODELS.models.some((m) => m.name === input.model)) return throwError(() => new AnimationFailure('unavailable', `the model "${input.model}" is not installed`));
      if (/notsvg/i.test(text)) return throwError(() => new AnimationFailure('refused', 'the model did not write a usable SVG: the reply has no <svg> element'));
      return timer(this.writeMs).pipe(map(() => svgOf(text)));
    });
  }

  plan(input: PlanInput): Observable<AssistedPlan> {
    return defer(() => {
      const text = input.text.trim();
      if (!this.features.includes(FEATURE_PLAN) || this.assistant === 'missing') return throwError(() => new AnimationFailure('unavailable', 'there is no assistant to plan with'));
      if (!text) return throwError(() => new AnimationFailure('refused', 'the sentence is empty'));
      if ([...text].length > MAX_PLAN_TEXT) return throwError(() => new AnimationFailure('refused', `the sentence is longer than ${MAX_PLAN_TEXT} characters`));
      if (input.model && !MODELS.models.some((m) => m.name === input.model)) return throwError(() => new AnimationFailure('unavailable', `the model "${input.model}" is not installed`));
      if (/busy/i.test(text)) return throwError(() => new AnimationFailure('busy', 'a run is active and the model is local'));
      if (/refuse/i.test(text)) return throwError(() => new AnimationFailure('refused', 'the model refused to write a plan'));
      return timer(this.writeMs).pipe(map(() => plannedFrom(text, this.catalogNow)));
    });
  }

  private promptProblem(prompt: string | undefined): string {
    return prompt !== undefined && prompt.length > MAX_PROMPT ? `prompt is longer than ${MAX_PROMPT} characters` : '';
  }

  /** The fixed rule's design: another palette than the one the piece has. */
  private writeDesign(r: Stored): void {
    const next = PALETTES.find((p) => p.dark !== r.design.design.dark) ?? PALETTES[0];
    r.design = { design: structuredClone(next), source: 'fallback', edited: false };
  }

  private writeScript(r: Stored): void {
    r.script = scriptOf(r.songMap, r.level, r.design.design);
    r.scriptSource = 'fallback';
  }

  /** The proposal as the clock says it is now; when it is done what it decided is applied once. */
  private proposalOf(r: Stored): ProposalState | undefined {
    const p = r.proposal;
    if (!p) return undefined;
    const elapsed = this.now() - p.startedAt;
    const state = elapsed < p.waitMs ? 'waiting' : elapsed < p.waitMs + p.writeMs ? 'writing' : 'done';
    if (state === 'done' && !p.applied) {
      p.applied = true;
      this.writeDesign(r);
      this.writeScript(r);
      this.changed();
    }
    const source = { source: 'fallback' as const, reason: p.reason };
    return { state, what: 'all', model: p.model, startedAt: p.startedAt, ...(state === 'done' ? { finishedAt: p.startedAt + p.waitMs + p.writeMs, design: source, script: source } : {}) };
  }

  transcribe(id: string): Observable<PieceDetail> {
    return defer(() =>
      this.idle(id).pipe(
        switchMap((r) => {
          if (this.whisper === 'missing') return throwError(() => new AnimationFailure('unavailable', 'whisper-cli is not installed'));
          return timer(this.transcribeMs).pipe(
            switchMap(() => this.idle(id)),
            map((again) => {
              const instrumental = SONGS.find((x) => x.project === again.source.project && x.trackId === again.source.trackId && x.variant === again.source.variant)?.instrumental === true;
              const problem = this.hearProblem(again, instrumental);
              if (problem) return this.detail(again, { notice: problem });
              const warning = this.hear(again);
              this.changed();
              return this.detail(again, warning ? { scriptWarning: warning } : {});
            }),
          );
        }),
      ),
    );
  }

  // ---------------------------------------------------------------- references

  references(): Observable<readonly Reference[]> {
    return defer(() => {
      this.publishReferences();
    this.publishDrafts();
      return this.refList.asObservable();
    });
  }

  reference(id: string): Observable<Reference> {
    return defer(() => this.findReference(id).pipe(map((r) => this.readReference(r))));
  }

  addReference(input: ReferenceInput): Observable<Reference> {
    return defer(() => {
      const problems = validateReferenceInput(input);
      if (problems.length) return throwError(() => new AnimationFailure('refused', `this reference is not accepted: ${problems.join(', ')}`));
      const url = input.url?.trim();
      const file = input.file;
      if (file && !file.type.startsWith('video/')) return throwError(() => new AnimationFailure('refused', `${file.name} is not a video`));
      if (url && !YOUTUBE.test(url)) return throwError(() => new AnimationFailure('refused', `${url} is not a YouTube address`));
      if (url && /long/i.test(url)) return throwError(() => new AnimationFailure('refused', 'the video lasts more than 20 minutes'));
      const id = `ref-${++this.refCounter}-${this.now().toString(36)}`;
      const kind = url && /nodesc/i.test(url) ? 'nodesc' : url && /broken/i.test(url) ? 'broken' : 'ok';
      const record: StoredReference = { id, title: input.title?.trim() || (url ? `Video ${this.refCounter}` : (file?.name ?? id)), notes: input.notes ?? '', tags: [...(input.tags ?? [])], ...(url ? { source: url } : {}), createdAt: this.now(), kind };
      this.refs.set(id, record);
      this.changed();
      return of(this.readReference(record));
    });
  }

  editReference(id: string, patch: ReferencePatch): Observable<Reference> {
    return defer(() =>
      this.findReference(id).pipe(
        map((r) => {
          if (patch.title !== undefined && (!patch.title.trim() || patch.title.length > 120)) throw new AnimationFailure('refused', 'title must have 1 to 120 characters');
          if (patch.notes !== undefined && patch.notes.length > 2000) throw new AnimationFailure('refused', 'notes are longer than 2000 characters');
          if (patch.tags !== undefined && (patch.tags.length > 10 || patch.tags.some((t) => t.length > 40))) throw new AnimationFailure('refused', 'tags: up to 10 of up to 40 characters');
          if (patch.title !== undefined) r.title = patch.title.trim();
          if (patch.notes !== undefined) r.notes = patch.notes;
          if (patch.tags !== undefined) r.tags = [...patch.tags];
          this.changed();
          return this.readReference(r);
        }),
      ),
    );
  }

  removeReference(id: string): Observable<void> {
    return defer(() =>
      this.findReference(id).pipe(
        map(() => {
          this.refs.delete(id);
          this.changed();
        }),
      ),
    );
  }

  // ---------------------------------------------------------------- part drafts

  drafts(): Observable<readonly Draft[]> {
    return defer(() => {
      this.publishDrafts();
      return this.draftList.asObservable();
    });
  }

  draft(id: string): Observable<Draft> {
    return defer(() => this.findDraft(id).pipe(map((d) => this.readDraft(d, true))));
  }

  /**
   * Asks for a part. What the phrase says decides how the draft ends, so every case can be seen with no server: `minor` with a
   * picture fails by the age check (the picture is not kept, no retry), `fail` fails once and a retry writes it, `clash` is
   * written with the name of a part of the catalog, `problems` is written and its first save is refused; `busy` and `nochrome`
   * are refused as the server does.
   */
  askDraft(input: DraftInput): Observable<Draft> {
    return defer(() => {
      const problems = validateDraftInput(input);
      if (problems.length) return throwError(() => new AnimationFailure('refused', `this part is not accepted: ${problems.join(', ')}`));
      const phrase = input.request.trim();
      if (input.scene && !this.features.includes(FEATURE_SCENE)) return throwError(() => new AnimationFailure('refused', 'this server has no scenes'));
      if (input.review && !this.features.includes(FEATURE_REVIEW)) return throwError(() => new AnimationFailure('unavailable', 'this server cannot review a draft'));
      if (input.scene) return this.askScene(input);
      if (input.model && !MODELS.models.some((m) => m.name === input.model)) return throwError(() => new AnimationFailure('refused', `the model "${input.model}" is not installed (installed: ${MODELS.models.map((m) => m.name).join(', ')})`));
      if (/busy/i.test(phrase)) return throwError(() => new AnimationFailure('busy', 'a run is active and the model is local'));
      if (/nochrome/i.test(phrase)) return throwError(() => new AnimationFailure('unavailable', 'Chrome is not installed on this machine'));
      const withPicture = !!(input.file || input.frame);
      // A change to a text: the assistant starts from it. The name is kept; the rewrite is simulated by a visible change of the description and the fragment.
      const base = input.base;
      const baseName = base ? nameOf(base.manifest) : undefined;
      if (base && (!baseName || !base.fragment.trim())) return throwError(() => new AnimationFailure('refused', 'the manifest needs a name and the fragment cannot be empty'));
      const kind = /minor/i.test(phrase) && withPicture ? 'minor' : /fail/i.test(phrase) ? 'fail' : /clash/i.test(phrase) ? 'clash' : /problems/i.test(phrase) ? 'problems' : 'ok';
      const id = `draft-${++this.draftCounter}-${this.now().toString(36)}`;
      const name = kind === 'clash' ? 'counter' : `part-${this.draftCounter}`;
      const record: StoredDraft = {
        id,
        request: phrase,
        withPicture,
        ...(input.file ? { source: 'upload' } : input.frame ? { source: `reference:${input.referenceId}/${input.frame}` } : {}),
        ...(withPicture ? { description: 'A dark scene with warm colours and big type.' } : {}),
        createdAt: this.now(),
        attempts: 1,
        kind,
        manifest: base ? JSON.stringify({ ...(JSON.parse(base.manifest) as object), description: `${(JSON.parse(base.manifest) as { description?: string }).description ?? ''} (changed: ${phrase})`.trim() }, null, 2) : JSON.stringify({ name, description: phrase, params: [] }, null, 2),
        fragment: base ? `${base.fragment}\n<!-- changed: ${phrase.replace(/--/g, '-')} -->` : `<div class="${name}">${phrase}</div>`,
        ...(baseName ? { replaces: baseName } : {}),
        ...(input.model ? { model: input.model } : {}),
      };
      this.draftsById.set(id, record);
      this.changed();
      return of(this.readDraft(record, false));
    });
  }

  /** A scene for one script piece: the draft's name and text come from the piece and the idea, so what happens is the same every time. */
  private askScene(input: DraftInput): Observable<Draft> {
    const scene = input.scene!;
    const record = this.records.get(scene.piece);
    const piece = record?.script.pieces.find((p) => p.id === scene.scriptPiece);
    if (!record) return throwError(() => new AnimationFailure('missing', `piece "${scene.piece}" not found`));
    if (!piece) return throwError(() => new AnimationFailure('missing', `piece "${scene.piece}" has no script piece "${scene.scriptPiece}"`));
    if (input.model && !MODELS.models.some((m) => m.name === input.model)) return throwError(() => new AnimationFailure('refused', `the model "${input.model}" is not installed`));
    const draft = this.makeSceneDraft(record, piece, input.scene?.brief ?? '', input.request.trim(), this.now(), input.model, input.review);
    this.changed();
    return of(this.readDraft(draft, false));
  }

  private makeSceneDraft(record: Stored, piece: ScriptPiece, brief: string, request: string, createdAt: number, model: string | undefined, review: boolean | ReviewAsk | undefined): StoredDraft {
    const id = `draft-${++this.draftCounter}-${this.now().toString(36)}`;
    const idea = brief || request;
    const name = `scene-${record.id.slice(-12).replace(/[^a-z0-9]/gi, '').toLowerCase()}-${this.draftCounter}`.slice(0, 32);
    const lines = (piece.lines ?? []).filter((l) => l.text);
    // The idea as big words that appear at the lines' times: the keyword of each line in the accent, which is what a person sees to judge it.
    const words = lines.map((l, i) => `<div class="w w${i}" data-at="${l.start ?? piece.start}">${escapeHtml(l.keyword || (l.text ?? '').split(/\s+/)[0] || '')}</div>`).join('\n');
    const manifest = JSON.stringify({ name, description: idea || `A scene for ${piece.id}`, version: 1, verse: 'own', scene: { piece: record.id, script_piece: piece.id }, params: [] }, null, 2);
    const fragment = `<div class="scene">${idea ? `<p class="idea">${escapeHtml(idea)}</p>\n` : ''}${words}</div>`;
    const draft: StoredDraft = { id, request: idea, withPicture: false, createdAt, attempts: 1, kind: 'ok', manifest, fragment, ...(model ? { model } : {}), scene: { piece: record.id, scriptPiece: piece.id }, brief: idea, ...(review ? { review: review === true ? true : { ...review } } : {}) };
    this.draftsById.set(id, draft);
    return draft;
  }

  saveDraft(id: string, text: DraftText): Observable<Draft> {
    return defer(() =>
      this.findDraft(id).pipe(
        map((d) => {
          if (isWritingDraft(this.draftState(d))) throw new AnimationFailure('busy', `draft "${id}" is being written: wait for it to end`);
          const problems = this.textProblems(text);
          if (d.kind === 'problems' && !problems.length && d.manifest === text.manifest && d.fragment === text.fragment) problems.push('part.html: the fragment draws nothing that moves; change it');
          if (problems.length) throw new AnimationFailure('refused', problems.join('\n'));
          d.manifest = text.manifest;
          d.fragment = text.fragment;
          if (d.kind === 'problems' || d.kind === 'invalid') {
            d.kind = 'ok';
            delete d.problems;
          }
          this.changed();
          return this.readDraft(d, true);
        }),
      ),
    );
  }

  createDraftFromText(text: DraftText): Observable<Draft> {
    return defer(() => {
      const problems = this.textProblems(text);
      const name = nameOf(text.manifest);
      if (name && this.catalogNow.parts.some((p) => p.name === name)) problems.push(`manifest.json: a part named "${name}" already exists: choose another name`);
      const id = `draft-${++this.draftCounter}-${this.now().toString(36)}`;
      const record: StoredDraft = { id, request: name ?? '', withPicture: false, createdAt: this.now() - this.writeMs, attempts: 1, kind: problems.length ? 'invalid' : 'ok', manifest: text.manifest, fragment: text.fragment, ...(problems.length ? { problems } : {}) };
      this.draftsById.set(id, record);
      this.changed();
      return of(this.readDraft(record, true));
    });
  }

  retryDraft(id: string): Observable<Draft> {
    return defer(() =>
      this.findDraft(id).pipe(
        map((d) => {
          const now = this.readDraft(d, false);
          if (now.state !== 'failed') throw new AnimationFailure('refused', `draft "${id}" is not failed`);
          if (d.kind === 'invalid') throw new AnimationFailure('refused', `draft "${id}" was made from a text: edit it and save instead`);
          if (pictureLost(now)) throw new AnimationFailure('refused', 'the picture was not kept: ask again');
          d.kind = 'ok';
          d.attempts += 1;
          d.createdAt = this.now();
          this.changed();
          return this.readDraft(d, false);
        }),
      ),
    );
  }

  approveDraft(id: string): Observable<Part> {
    return defer(() =>
      this.findDraft(id).pipe(
        map((d) => {
          if (this.draftState(d) !== 'ready') throw new AnimationFailure('refused', `draft "${id}" is not ready`);
          const manifest = JSON.parse(d.manifest) as { name: string; description?: string; params?: unknown; verse?: string; hit?: string; scene?: { piece?: string; script_piece?: string } };
          // A scene is what the draft was asked for, or what a text said it was (a dataset brings its scenes as texts).
          const scene = d.scene ?? (manifest.scene?.piece && manifest.scene.script_piece ? { piece: manifest.scene.piece, scriptPiece: manifest.scene.script_piece } : undefined);
          if (this.catalogNow.parts.some((p) => p.name === manifest.name)) throw new AnimationFailure('busy', `a part named "${manifest.name}" already exists: change the name by editing the draft`);
          const part: Part = { name: manifest.name, description: manifest.description ?? d.request, levels: [...this.catalogNow.levels], costMs: 60, manual: false, source: 'user', ...(scene ? { verse: 'own' as const, scene: { piece: scene.piece, scriptPiece: scene.scriptPiece } } : {}), params: paramsOfManifest(manifest) };
          this.catalogNow = { ...this.catalogNow, parts: [...this.catalogNow.parts, part] };
          if (d.fragment) this.partTexts.set(manifest.name, { name: manifest.name, manifest: d.manifest, fragment: d.fragment });
          this.draftsById.delete(id);
          this.changed();
          return part;
        }),
      ),
    );
  }

  partText(name: string): Observable<PartText> {
    const text = this.partTexts.get(name);
    return text ? of(text) : throwError(() => new AnimationFailure('missing', `no part "${name}" of the user's`));
  }

  replacePart(name: string, text: DraftText): Observable<Part> {
    return defer(() => {
      const part = this.userPart(name);
      const problems = this.textProblems(text);
      const named = nameOf(text.manifest);
      if (named && named !== name) problems.push(`manifest.json: the name must stay "${name}"`);
      if (problems.length) return throwError(() => new AnimationFailure('refused', problems.join('\n')));
      const manifest = JSON.parse(text.manifest) as { name: string; description?: string; params?: unknown };
      const next: Part = { ...part, description: manifest.description ?? part.description, params: paramsOfManifest(manifest) };
      this.catalogNow = { ...this.catalogNow, parts: this.catalogNow.parts.map((p) => (p.name === name ? next : p)) };
      this.partTexts.set(name, { name, manifest: text.manifest, fragment: text.fragment });
      this.changed();
      return of(next);
    });
  }

  removePart(name: string, force = false): Observable<void> {
    return defer(() => {
      this.userPart(name);
      const users = this.usersOf(name);
      if (users.length && !force) return throwError(() => new AnimationFailure('busy', `the part "${name}" is used by ${users.join(', ')}: delete it anyway to leave them without it`));
      this.catalogNow = { ...this.catalogNow, parts: this.catalogNow.parts.filter((p) => p.name !== name) };
      this.partTexts.delete(name);
      this.changed();
      return of(undefined);
    });
  }

  /** A part of the user's, as the server only touches those: `missing` when there is none with the name, `busy` when it comes with the program. */
  private userPart(name: string): Part {
    const part = this.catalogNow.parts.find((p) => p.name === name);
    if (!part) throw new AnimationFailure('missing', `part "${name}" not found`);
    if (part.source !== 'user') throw new AnimationFailure('busy', `the part "${name}" comes with the program: it cannot be changed or deleted`);
    return part;
  }

  /** What uses a part: the pieces whose script has it as main part, extra or layer item, and the styles that list it. */
  private usersOf(name: string): string[] {
    const pieces = [...this.records.values()].filter((r) => r.script.pieces.some((s) => s.part === name || s.with?.some((w) => w.part === name)) || r.script.layers?.some((l) => l.items.some((i) => i.part === name))).map((r) => `piece ${r.id}`);
    const styles = [...this.presetsById.values()].filter((p) => p.parts.includes(name)).map((p) => `style ${p.id}`);
    return [...pieces, ...styles];
  }

  removeDraft(id: string): Observable<void> {
    return defer(() =>
      this.findDraft(id).pipe(
        map(() => {
          this.draftsById.delete(id);
          this.changed();
        }),
      ),
    );
  }

  private draftState(d: StoredDraft): 'writing' | 'ready' | 'failed' {
    if (this.now() - d.createdAt < this.writeMs) return 'writing';
    return d.kind === 'minor' || d.kind === 'fail' || d.kind === 'invalid' ? 'failed' : 'ready';
  }

  private readDraft(d: StoredDraft, full: boolean): Draft {
    const state = this.draftState(d);
    const base = { id: d.id, request: d.request, withPicture: d.withPicture, attempts: d.attempts, createdAt: d.createdAt, problems: [] as string[], ...(d.scene ? { scene: { ...d.scene } } : {}), ...(d.scene ? { brief: d.brief ?? '' } : {}), ...(d.review && typeof d.review === 'object' ? { reviewAsk: { ...d.review } } : {}), ...(d.replaces ? { replaces: d.replaces } : {}), ...(d.model ? { model: d.model } : {}), ...(d.source ? { source: d.source } : {}), ...(d.description ? { description: d.description } : {}) };
    if (state === 'writing') return { ...base, state, preview: [] };
    if (d.kind === 'invalid') return { ...base, state: 'failed', preview: [], problems: d.problems ?? [], error: (d.problems ?? []).join('\n'), manifest: d.manifest, fragment: d.fragment };
    if (state === 'failed') return { ...base, state, preview: [], error: d.kind === 'minor' ? 'the picture shows a minor: it was not kept and the part was not written' : 'the assistant could not write a part that passes the checks' };
    const name = (JSON.parse(d.manifest) as { name: string }).name;
    const review = d.review ? this.draftReview(d) : undefined;
    const warnings = this.slotWarnings(d);
    return { ...base, state, name, preview: [frameOf('#264653', 1), frameOf('#2a9d8f', 2)], ...(review ? { review } : {}), ...(warnings.length ? { warnings } : {}), ...(full ? { manifest: d.manifest, fragment: d.fragment } : {}) };
  }

  /** What is wrong with the text of a draft, as the server's checks would say it (simplified). */
  private textProblems(text: DraftText): string[] {
    const problems: string[] = [];
    try {
      const m = JSON.parse(text.manifest) as { name?: unknown };
      if (typeof m.name !== 'string' || !m.name.trim()) problems.push('manifest.json: name is missing');
    } catch {
      problems.push('manifest.json: it is not valid JSON');
    }
    if (!text.fragment.trim()) problems.push('part.html: it is empty');
    if (/transition|@keyframes|animation:/i.test(text.fragment)) problems.push('part.html: CSS transitions and animations are not allowed: the clock draws the frames');
    return problems;
  }

  /** The `{{asset:name}}` slots of a draft that the theme of its piece has no drawing for: the slot would be empty. */
  private slotWarnings(d: StoredDraft): string[] {
    const assets = d.scene ? this.records.get(d.scene.piece)?.design.design.theme?.assets ?? {} : {};
    return [...d.fragment.matchAll(/\{\{asset:([a-z][a-z0-9_]*)\}\}/g)].map((m) => m[1]).filter((n, i, all) => all.indexOf(n) === i && !(n in assets)).map((n) => `{{asset:${n}}}: the theme has no drawing with that name`);
  }

  /**
   * The review of a draft, by a rule so that it can be seen with no model: a short idea scores low, a longer one higher. With a minimum a draft that scores under it is
   * rewritten (each version climbs a point) up to the attempts asked, and the best is what stays; the rewrites are the climb.
   */
  private draftReview(d: StoredDraft): DraftReview {
    const ask: ReviewAsk = d.review === true ? {} : (d.review ?? {});
    const first = Math.min(9, 3 + Math.floor((d.brief ?? d.request).length / 12));
    const max = Math.min(ask.attempts ?? 2, REVIEW_ATTEMPTS_MAX);
    const versions = [first];
    while (ask.min !== undefined && versions[versions.length - 1] < ask.min && versions.length <= max) versions.push(Math.min(10, versions[versions.length - 1] + 1));
    const score = Math.max(...versions);
    const notes = score >= 7 ? ['The metaphor reads at a glance.', 'The keyword lands on its word.'] : ['Say what the verse means with one image, not a list of words.', 'The accent is used twice: keep it for the keyword.'];
    return { score, verdict: verdictOf(score), notes, model: 'gemma4:26b', attempts: versions.length > 1 ? versions.map((v) => ({ score: v, verdict: verdictOf(v), notes: [] })) : [] };
  }

  private findDraft(id: string): Observable<StoredDraft> {
    const d = this.draftsById.get(id);
    return d ? of(d) : throwError(() => new AnimationFailure('missing', `draft "${id}" not found`));
  }

  private publishDrafts(): void {
    this.draftList.next([...this.draftsById.values()].map((d) => this.readDraft(d, false)).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)));
  }

  // ---------------------------------------------------------------- learning

  /**
   * Learns from a ready reference by a rule, not by chance: a style named after it and one part draft for each idea of `LEARN_IDEAS` that is farther
   * from the catalog than the strictness asks (the others are dropped, with the part they resemble). A style is dropped when the reference already has one.
   * Without a description (the address says `nodesc`) there is no vision: no parts, and `skipped` says so. It runs for `writeMs`, like a draft.
   */
  learn(referenceId: string, strictness: Strictness = 'normal'): Observable<Learning> {
    return defer(() => {
      if (!STRICTNESSES.includes(strictness)) return throwError(() => new AnimationFailure('refused', `strictness must be low, normal or high, not "${String(strictness)}"`));
      const record = this.refs.get(referenceId);
      if (!record) return throwError(() => new AnimationFailure('missing', `reference "${referenceId}" not found`));
      const reference = this.readReference(record);
      if (reference.state !== 'ready' || !reference.analysis) return throwError(() => new AnimationFailure('busy', `reference "${referenceId}" is not ready: it is ${reference.state}`));
      const running = [...this.learningsById.values()].find((l) => l.referenceId === referenceId && this.learningState(l) === 'running');
      if (running) return of(this.readLearning(running));
      const threshold = LEARN_THRESHOLD[strictness];
      const stored: StoredLearning = { id: `learn-${++this.learnCounter}-${this.now().toString(36)}`, referenceId, strictness, createdAt: this.now(), drafts: [], discarded: [], skipped: [] };
      // the style
      const existing = [...this.presetsById.values()].find((p) => p.referenceId === referenceId);
      const styleDistance = existing ? 0.15 : 0.45;
      const styleName = `${reference.title} (learned)`;
      if (styleDistance < threshold) {
        stored.discarded.push({ kind: 'style', name: styleName, similarTo: { kind: 'style', id: existing?.id, name: existing?.name ?? 'a style', distance: styleDistance, reason: 'same colours and rhythm' }, reason: `too similar to the style "${existing?.name}": its distance ${styleDistance} is below ${threshold}` });
      } else {
        const preset = this.presetFrom(reference, `preset-${this.presetsById.size + 1}-${this.now().toString(36)}`, styleName);
        this.presetsById.set(preset.id, preset);
        stored.style = { id: preset.id, name: preset.name, ...(existing ? { similarTo: { kind: 'style', id: existing.id, name: existing.name, distance: styleDistance, reason: 'a different palette' } } : {}) };
      }
      // the parts
      if (record.kind === 'nodesc') {
        stored.skipped.push({ what: 'parts', reason: 'there is no vision model to describe the video' });
      } else {
        for (const { idea, closest, distance } of LEARN_IDEAS) {
          const similarTo: LearnSimilar = { kind: 'part', name: closest, distance, reason: `it draws something like "${closest}"` };
          if (distance < threshold) {
            stored.discarded.push({ kind: 'part', name: idea, idea, similarTo, reason: `too similar to the part "${closest}": its distance ${distance} is below ${threshold}` });
            continue;
          }
          let made: Draft | undefined;
          this.askDraft({ request: idea }).subscribe((d) => (made = d));
          if (made) stored.drafts.push({ id: made.id, name: idea, similarTo });
        }
      }
      this.learningsById.set(stored.id, stored);
      this.changed();
      return of(this.readLearning(stored));
    });
  }

  learning(id: string): Observable<Learning> {
    return defer(() => {
      const l = this.learningsById.get(id);
      return l ? of(this.readLearning(l)) : throwError(() => new AnimationFailure('missing', `learning "${id}" not found`));
    });
  }

  learnings(referenceId?: string): Observable<readonly Learning[]> {
    return defer(() =>
      of(
        [...this.learningsById.values()]
          .filter((l) => !referenceId || l.referenceId === referenceId)
          .map((l) => this.readLearning(l))
          .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)),
      ),
    );
  }

  private learningState(l: StoredLearning): 'running' | 'ready' {
    return this.now() - l.createdAt < this.writeMs ? 'running' : 'ready';
  }

  private readLearning(l: StoredLearning): Learning {
    const state = this.learningState(l);
    const base = { id: l.id, referenceId: l.referenceId, strictness: l.strictness, createdAt: l.createdAt };
    if (state === 'running') return { ...base, state, styles: [], partDrafts: [], discarded: [], skipped: [] };
    return {
      ...base,
      state,
      finishedAt: l.createdAt + this.writeMs,
      styles: l.style ? [{ id: l.style.id, name: l.style.name, novel: true, ...(l.style.similarTo ? { similarTo: l.style.similarTo } : {}), state: this.presetsById.has(l.style.id) ? 'ready' : 'gone' }] : [],
      partDrafts: l.drafts.map((d) => {
        const draft = this.draftsById.get(d.id);
        return { id: d.id, name: d.name, novel: true, ...(d.similarTo ? { similarTo: d.similarTo } : {}), state: draft ? this.draftState(draft) : 'gone' };
      }),
      discarded: structuredClone(l.discarded),
      skipped: structuredClone(l.skipped),
    };
  }

  // ---------------------------------------------------------------- presets

  presets(): Observable<readonly Preset[]> {
    return defer(() => of([...this.presetsById.values()].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))));
  }

  preset(id: string): Observable<Preset> {
    return defer(() => this.findPreset(id).pipe(map((p) => structuredClone(p))));
  }

  makePreset(referenceId: string, name?: string): Observable<Preset> {
    return defer(() => {
      const record = this.refs.get(referenceId);
      if (!record) return throwError(() => new AnimationFailure('refused', `reference "${referenceId}" does not exist`));
      const reference = this.readReference(record);
      if (reference.state !== 'ready' || !reference.analysis) return throwError(() => new AnimationFailure('refused', `reference "${referenceId}" is not ready: it is ${reference.state}`));
      const preset = this.presetFrom(reference, `preset-${this.presetsById.size + 1}-${this.now().toString(36)}`, name?.trim() || reference.title);
      this.presetsById.set(preset.id, preset);
      this.changed();
      return of(structuredClone(preset));
    });
  }

  /** The style a ready reference gives: its main colour for the accent (unless it is too dark to read) and a rhythm from its cuts. */
  private presetFrom(reference: Reference, id: string, name: string): Preset {
    const adjustments: string[] = [];
    const base = PALETTES[0];
    let accent = reference.analysis?.colours[0]?.hex ?? base.accent;
    if (contrast(accent, base.dark) < 3) {
      adjustments.push(`accent ${accent} had less than 3:1 contrast with the dark background and became ${base.accent}`);
      accent = base.accent;
    }
    return {
      id,
      name,
      referenceId: reference.id,
      createdAt: this.now(),
      design: { ...base, accent, modes: {} },
      rhythm: Math.min(MAX_RHYTHM, Math.max(MIN_RHYTHM, Math.round((reference.analysis?.meanShot ?? 3) * 2))),
      parts: [],
      adjustments,
    };
  }

  savePreset(id: string, input: PresetInput): Observable<Preset> {
    return defer(() =>
      this.findPreset(id).pipe(
        map((p) => {
          if (!input.name.trim()) throw new AnimationFailure('refused', 'name is empty');
          if (!(input.rhythm >= MIN_RHYTHM && input.rhythm <= MAX_RHYTHM)) throw new AnimationFailure('refused', `rhythm ${input.rhythm} is not between ${MIN_RHYTHM} and ${MAX_RHYTHM} seconds`);
          const problem = this.designProblem(input.design);
          if (problem) throw new AnimationFailure('refused', `design.${problem}`);
          const unknown = input.parts.findIndex((n) => !this.catalogNow.parts.some((x) => x.name === n));
          if (unknown >= 0) throw new AnimationFailure('refused', `parts[${unknown}]: "${input.parts[unknown]}" is not in the catalog`);
          const saved: Preset = { ...p, name: input.name.trim(), design: structuredClone(input.design), rhythm: input.rhythm, parts: [...input.parts] };
          this.presetsById.set(id, saved);
          this.changed();
          return structuredClone(saved);
        }),
      ),
    );
  }

  removePreset(id: string): Observable<void> {
    return defer(() =>
      this.findPreset(id).pipe(
        map(() => {
          this.presetsById.delete(id);
          this.changed();
        }),
      ),
    );
  }

  render(id: string): Observable<Estimate> {
    return defer(() =>
      this.idle(id).pipe(
        map((r) => {
          const problem = this.scriptProblem(r.script, r.songMap.duration);
          if (problem) throw new AnimationFailure('refused', problem);
          r.renderedAt = this.now();
          this.changed();
          return this.estimateOf(r);
        }),
      ),
    );
  }

  remove(id: string): Observable<void> {
    return defer(() =>
      this.idle(id).pipe(
        map(() => {
          this.records.delete(id);
          this.changed();
        }),
      ),
    );
  }

  follow(id: string): Observable<Piece> {
    return defer(() =>
      timer(0, this.pollMs).pipe(
        map(() => this.records.get(id)),
        takeWhile((r): r is Stored => r !== undefined),
        map((r) => this.view(r)),
        distinctUntilChanged((a, b) => a.state === b.state && a.progress === b.progress),
        takeWhile((p) => !isFinished(p), true),
      ),
    );
  }

  // ---------------------------------------------------------------- the state of a render, by the clock

  private stateOf(r: Stored): { state: PieceState; progress: number } {
    if (r.failure !== undefined) return { state: 'failed', progress: 0 };
    if (r.renderedAt === undefined) return { state: 'draft', progress: 0 };
    const elapsed = this.now() - r.renderedAt;
    if (elapsed < this.stepMs) return { state: 'queued', progress: 0 };
    const progress = Math.floor(((elapsed - this.stepMs) / (this.stepMs * RUN_STEPS)) * 100);
    return progress < 100 ? { state: 'running', progress: Math.min(99, progress) } : { state: 'done', progress: 100 };
  }

  private estimateOf(r: Stored): Estimate {
    const frames = Math.round(r.songMap.duration * r.fps);
    const cost = { simple: 55, medium: 70, advanced: 85 }[r.level] * (r.fps === 60 ? 1.1 : 1);
    return { seconds: Math.round((frames * cost) / 1000), frames };
  }

  private view(r: Stored): Piece {
    const { state, progress } = this.stateOf(r);
    const { design: _d, script: _s, scriptSource: _o, songMap, renderedAt: _r, sampleVideo: _v, failure: _f, prompt: _p, proposal: _q, batch: _b, review: _w, ...rest } = r;
    return { ...rest, state, progress, estimate: this.estimateOf(r), sizeBytes: state === 'done' ? (r.sampleVideo?.bytes ?? Math.round(songMap.duration * 700_000)) : 0, ...(state === 'done' ? { video: r.sampleVideo?.address ?? `/api/projects/${r.id}/artifacts/out/${r.id}.mp4` } : {}), ...(state === 'failed' ? { error: r.failure } : {}) };
  }

  private detail(r: Stored, extra: Pick<PieceDetail, never> & { notice?: string; scriptWarning?: string } = {}): PieceDetail {
    const proposal = this.proposalOf(r);
    return { ...this.view(r), design: structuredClone(r.design), script: structuredClone(r.script), scriptSource: r.scriptSource, songMap: r.songMap, ...(r.prompt ? { prompt: r.prompt } : {}), ...(proposal ? { proposal } : {}), ...(r.batch ? { scenes: this.batchOf(r) } : {}), ...(r.review ? { review: this.reviewOf(r) } : {}), ...extra };
  }

  /** Why the words cannot be heard for this piece, or empty when they can. */
  private hearProblem(_r: Stored, instrumental: boolean): string {
    if (this.whisper === 'missing') return 'the words were not heard: whisper-cli is not installed, so their times are estimated';
    return instrumental ? 'the words were not heard: the song has none, so the piece stays as it was' : '';
  }

  /** The words are heard: they stop being estimated; a script nobody edited is made again, an edited one is kept and warned about. */
  private hear(r: Stored): string {
    r.songMap = { ...r.songMap, wordsEstimated: false };
    if (r.scriptSource === 'user') return `your script was kept: ${r.script.pieces.length} pieces may need adjusting to the new sections`;
    r.script = scriptOf(r.songMap, r.level, r.design.design);
    return '';
  }

  // ---------------------------------------------------------------- what a reference is, by the clock

  private readReference(r: StoredReference): Reference {
    const base = { id: r.id, title: r.title, notes: r.notes, tags: r.tags, ...(r.source ? { source: r.source } : {}), createdAt: r.createdAt };
    if (this.now() - r.createdAt < this.analyseMs) return { ...base, state: 'analysing' };
    if (r.kind === 'broken') return { ...base, state: 'failed', error: 'the video could not be read' };
    return { ...base, state: 'ready', analysis: this.analysisOf(r) };
  }

  private analysisOf(r: StoredReference): Analysis {
    const colours = COLOURS.map((hex, i) => ({ hex, share: [0.35, 0.25, 0.2, 0.12, 0.08][i] }));
    return {
      duration: 90,
      fps: 30,
      width: 1280,
      height: 720,
      frames: COLOURS.map((hex, i) => frameOf(hex, i + 1)),
      colours,
      thirds: [colours, [...colours].reverse(), colours],
      cuts: 24,
      meanShot: 3.75,
      tempo: 112,
      key: 'A minor',
      ...(r.kind === 'nodesc' ? { descriptionNote: 'there is no vision model to describe the video' } : { description: 'Warm colours on a dark ground, fast cuts and big type.' }),
    };
  }

  private findReference(id: string): Observable<StoredReference> {
    const r = this.refs.get(id);
    return r ? of(r) : throwError(() => new AnimationFailure('missing', `reference "${id}" not found`));
  }

  private findPreset(id: string): Observable<Preset> {
    const p = this.presetsById.get(id);
    return p ? of(p) : throwError(() => new AnimationFailure('missing', `preset "${id}" not found`));
  }

  private publishReferences(): void {
    this.refList.next([...this.refs.values()].map((r) => this.readReference(r)).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)));
  }

  // ---------------------------------------------------------------- lookups and rules

  private find(id: string): Observable<Stored> {
    const r = this.records.get(id);
    return r ? of(r) : throwError(() => new AnimationFailure('missing', `piece "${id}" not found`));
  }

  /** The piece, unless it is being drawn: what changes a piece or removes it is refused then. */
  private idle(id: string): Observable<Stored> {
    return this.find(id).pipe(
      switchMap((r) => {
        if (isBusy(this.view(r))) return throwError(() => new AnimationFailure('busy', `piece "${id}" is being drawn: wait for it to end`));
        // Reading the proposal settles it: one that has ended applies what it wrote and no longer holds the piece.
        if (isProposing({ proposal: this.proposalOf(r) })) return throwError(() => new AnimationFailure('busy', `piece "${id}" has a proposal being written: wait for it to end`));
        return of(r);
      }),
    );
  }

  /** What is wrong with a theme and a crossfade, in the words the server uses (`design.theme.css: …`); nothing when they are fine. */
  private themeProblem(d: Design): string {
    if (d.transitionSeconds !== undefined && !(d.transitionSeconds >= 0 && d.transitionSeconds <= TRANSITION_MAX)) return `design.transition_seconds: it is from 0 to ${TRANSITION_MAX} seconds`;
    const t: Theme | undefined = d.theme;
    if (!t) return '';
    const css = t.css ?? '';
    if (css.length > THEME_CSS_MAX) return `design.theme.css: it is longer than ${THEME_CSS_MAX} characters`;
    if (/@import/i.test(css)) return 'design.theme.css: @import is not allowed';
    if (/url\(\s*['"]?(?!data:)/i.test(css)) return 'design.theme.css: url() may only hold a data: address';
    if (/expression\(|behavior:|javascript:|</i.test(css)) return 'design.theme.css: expression(, behavior:, javascript: and < are not allowed';
    const names = Object.keys(t.assets ?? {});
    if (names.length > THEME_ASSETS_MAX) return `design.theme.assets: at most ${THEME_ASSETS_MAX} drawings`;
    for (const name of names) {
      const svg = t.assets?.[name] ?? '';
      if (!THEME_ASSET_NAME.test(name)) return `design.theme.assets.${name}: a name is lower case letters, digits and _, from a letter, up to 32 characters`;
      if (svg.length > THEME_ASSET_BYTES) return `design.theme.assets.${name}: it is longer than ${THEME_ASSET_BYTES} characters`;
      if (!/^\s*<svg[\s>]/i.test(svg)) return `design.theme.assets.${name}: it is not an SVG`;
      if (/<script|<foreignObject|\son\w+\s*=|href\s*=\s*['"](?!#)/i.test(svg)) return `design.theme.assets.${name}: a script, a foreignObject, an event handler or an outside reference is not allowed`;
    }
    for (const [corner, text] of Object.entries(t.hud ?? {})) if ((text ?? '').length > THEME_HUD_MAX) return `design.theme.hud.${corner}: it is longer than ${THEME_HUD_MAX} characters`;
    return '';
  }

  private designProblem(d: Design): string {
    const theme = this.themeProblem(d);
    if (theme) return theme;
    for (const k of ['dark', 'light', 'accent'] as const) if (!HEX.test(d[k])) return `${k} is not a hexadecimal colour like #aabbcc`;
    for (const k of ['display', 'body'] as const) if (!this.catalogNow.fonts.includes(d[k])) return `${k} "${d[k]}" is not one of the typefaces`;
    if (d.concept.length > 200) return 'concept is longer than 200 characters';
    for (const mode of new Set([d.defaultMode, ...Object.values(d.modes)])) {
      const background = mode === 'dark' ? d.dark : d.light;
      if (contrast(d.accent, background) < 3) return `accent ${d.accent} has less than 3:1 contrast with the background of mode ${mode} (${background})`;
    }
    return '';
  }

  /** What is wrong with the keyframes of one part of a piece, in the words the server uses; nothing when they are fine. */
  private animateProblem(id: string, part: Part, animate: Animate | undefined, length: number): string {
    if (!animate || Object.keys(animate).length === 0) return '';
    if (!hasAnimateFeature(this.catalogNow)) return `piece ${id}: "animate" is not something the scripts of this server have`;
    return keyframeProblem(`piece ${id}`, part, animate, length);
  }

  private scriptProblem(script: Script, duration: number): string {
    if (!script.pieces.length) return 'the script needs at least one piece';
    let at = 0;
    for (const p of script.pieces) {
      if (!(p.end > p.start)) return `piece ${p.id}: it ends before it starts`;
      if (Math.abs(p.start - at) > 0.01) return `piece ${p.id}: ${p.start < at ? 'overlaps the one before' : `leaves a gap from ${at} to ${p.start} seconds`}`;
      at = p.end;
      const part = this.catalogNow.parts.find((x) => x.name === p.part);
      if (!part) return `piece ${p.id}: part "${p.part}" is not in the catalog`;
      for (const [name, value] of Object.entries(p.params ?? {})) {
        const q = part.params.find((x) => x.name === name);
        if (!q) return `piece ${p.id}: part ${part.name} has no parameter "${name}"`;
        if ((q.type === 'int' || q.type === 'number') && (typeof value !== 'number' || (q.min !== undefined && value < q.min) || (q.max !== undefined && value > q.max))) return `piece ${p.id}: parameter ${name} is outside ${q.min} to ${q.max}`;
      }
      const moving = this.animateProblem(p.id, part, p.animate, p.end - p.start);
      if (moving) return moving;
      for (const e of p.with ?? []) {
        if (!e.animate) continue;
        const extra = this.catalogNow.parts.find((x) => x.name === e.part);
        if (!extra) return `piece ${p.id}: part "${e.part}" is not in the catalog`;
        const extraMoving = this.animateProblem(p.id, extra, e.animate, p.end - p.start);
        if (extraMoving) return extraMoving;
      }
    }
    if (Math.abs(at - duration) > 0.01) return `the pieces end at ${at} seconds and the song at ${duration}`;
    // Layers come after the pieces, as in the server: a script that has them needs a server that says it takes them.
    if (script.layers && script.layers.length > 0) {
      if (!hasLayersFeature(this.catalogNow)) return '"layers" is not something the scripts of this server have';
      return layerProblems(script, this.catalogNow)[0]?.text ?? '';
    }
    return '';
  }

  // ---------------------------------------------------------------- the list and what survives a reload

  private publish(): void {
    this.list.next([...this.records.values()].map((r) => this.view(r)).sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)));
  }

  private changed(): void {
    this.publish();
    this.publishReferences();
    try {
      this.storage?.setItem(KEY, JSON.stringify({ counter: this.counter, refCounter: this.refCounter, records: [...this.records.values()], references: [...this.refs.values()], presets: [...this.presetsById.values()], learnings: [...this.learningsById.values()], learnCounter: this.learnCounter, drafts: [...this.draftsById.values()], draftCounter: this.draftCounter, parts: this.catalogNow.parts, extraSongs: this.extraSongs, partTexts: [...this.partTexts.values()] }));
    } catch {
      // storage full or blocked: the pieces stay in memory
    }
  }

  private load(): void {
    try {
      const saved = JSON.parse(this.storage?.getItem(KEY) ?? 'null') as { counter: number; refCounter?: number; records: Stored[]; references?: StoredReference[]; presets?: Preset[]; learnings?: StoredLearning[]; learnCounter?: number; drafts?: StoredDraft[]; draftCounter?: number; parts?: Part[]; extraSongs?: FixtureSong[]; partTexts?: PartText[] } | null;
      if (!saved) return;
      this.counter = saved.counter;
      this.refCounter = saved.refCounter ?? 0;
      for (const r of saved.records) this.records.set(r.id, r);
      for (const r of saved.references ?? []) this.refs.set(r.id, r);
      for (const p of saved.presets ?? []) this.presetsById.set(p.id, p);
      for (const l of saved.learnings ?? []) this.learningsById.set(l.id, l);
      this.learnCounter = saved.learnCounter ?? this.learnCounter;
      for (const d of saved.drafts ?? []) this.draftsById.set(d.id, d);
      this.draftCounter = saved.draftCounter ?? 0;
      this.extraSongs = saved.extraSongs ?? [];
      for (const t of saved.partTexts ?? []) this.partTexts.set(t.name, t);
      if (saved.parts) this.catalogNow = { ...memoryCatalog(this.features), parts: saved.parts };
      this.publish();
    } catch {
      // nothing readable: start empty
    }
  }
}

const escapeHtml = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isWritingDraft = (state: string): boolean => state === 'writing';
