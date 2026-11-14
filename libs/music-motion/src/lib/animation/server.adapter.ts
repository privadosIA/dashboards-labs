import type { ApiClient } from '@lab/api-client';
import { BehaviorSubject, EMPTY, Observable, Subscription, catchError, defer, defaultIfEmpty, distinctUntilChanged, filter, map, of, shareReplay, switchMap, takeWhile, tap, throwError, timer } from 'rxjs';

import { ANIM_CLIENT } from '../core/client';
import { AnimationFailure, MAX_SVG_TEXT, failureOf, isAnalysing, isBusy, isFinished, isProposing, isWriting, type AnimationPort, type Learning, type Strictness, type AssistModels, type Catalog, type Choices, type Design, type Draft, type DraftInput, type DraftText, type Estimate, type Part, type PartText, type Piece, type PieceDetail, type PiecePreview, type Preset, type PresetInput, type Proposal, type ProposeInput, type Reference, type ReferenceInput, type ReferencePatch, type Script, type Song, type SvgInput, type AssistedPlan, type PlanInput, type SceneBatch, type SceneInput, type SceneApproval, type PieceReview, MAX_PLAN_TEXT } from '@lab/animation-core';
import { fromSceneInput, toSceneBatch, toSceneApproval, toPieceReview, fromPlanInput, toAssistedPlan, fromDesign, fromPropose, fromDraftInput, fromDraftText, fromReferenceInput, fromReferencePatch, fromScript, fromPreset, toCatalog, toDetail, toDraft, toDraftForm, toPart, toPiece, toAssistModels, toProposal, toReference, type ServerProposal, toReferenceForm, toRequest, toSongs, toPreset, toLearning, type ServerLearning } from './server-mapping';
import { validateChoices, validateDraftInput, validateReferenceInput } from './validate';

/** What the adapter uses of the API client: the typed calls it makes and the address of a file. */
export type AnimationApi = Pick<ApiClient, 'get' | 'post' | 'put' | 'patch' | 'delete' | 'postForm' | 'urlOf'>;

export interface ServerAnimationOptions {
  /** Milliseconds between two reads of the server while a piece is unfinished. */
  pollMs?: number;
  /** The name this dashboard gives itself to the server. */
  client?: string;
}

const PIECES = '/api/music-motion/pieces';
const PIECE = '/api/music-motion/pieces/{id}';
const REFERENCES = '/api/music-motion/references';
const REFERENCE = '/api/music-motion/references/{id}';
const DRAFTS = '/api/music-motion/part-drafts';
const DRAFT = '/api/music-motion/part-drafts/{id}';
const PRESETS = '/api/music-motion/presets';
const PRESET = '/api/music-motion/presets/{id}';
const LEARN = '/api/music-motion/references/{id}/learn';
const LEARNINGS = '/api/music-motion/learnings';
const LEARNING = '/api/music-motion/learnings/{id}';

/** Every call fails as an `AnimationFailure` (a 401 passes through: the connection box deals with it). */
const failing = <T>() => catchError<T, Observable<never>>((e) => throwError(() => failureOf(e)));

/**
 * An animation port that makes the pieces through the server's music motion API and reads the songs from its library. The
 * server owns the state, so the adapter keeps only a copy of the list that it refreshes while anything is unfinished.
 */
export class ServerAnimation implements AnimationPort {
  private readonly pollMs: number;
  private readonly client: string;
  /** The catalog once it is read; a part approved later is added to it, so every read after that has it. */
  private catalogNow?: Catalog;
  private readonly all = new BehaviorSubject<readonly Piece[]>([]);
  /** The first load of the list, shared: whoever subscribes first sees the list as the server has it, not the empty one before it answers. */
  private pieceLoad?: Observable<unknown>;
  private poller?: Subscription;
  private readonly refs = new BehaviorSubject<readonly Reference[]>([]);
  private referenceLoad?: Observable<unknown>;
  private refPoller?: Subscription;
  private readonly draftList = new BehaviorSubject<readonly Draft[]>([]);
  private draftLoad?: Observable<unknown>;
  private draftPoller?: Subscription;

  private readonly urlOf = (address: string): string => this.api.urlOf(address);

  constructor(
    private readonly api: AnimationApi,
    { pollMs = 1500, client = ANIM_CLIENT }: ServerAnimationOptions = {},
  ) {
    this.pollMs = pollMs;
    this.client = client;
  }

  songs(): Observable<readonly Song[]> {
    return defer(() => this.api.get('/api/library')).pipe(
      map((library) => toSongs(library.songs ?? [], (a) => this.api.urlOf(a))),
      failing(),
    );
  }

  catalog(piece?: string): Observable<Catalog> {
    // With a piece, its scene parts join the catalog for this read only: the copy kept here, which every other screen reads, never holds them.
    if (piece) {
      return defer(() => this.catalog().pipe(switchMap((base) => this.api.get('/api/music-motion/catalog', { query: { piece } } as never).pipe(map((c) => ({ ...base, parts: toCatalog(c as never).parts })), failing()))));
    }
    return defer(() => (this.catalogNow ? of(this.catalogNow) : this.api.get('/api/music-motion/catalog').pipe(map(toCatalog), tap((c) => (this.catalogNow = c)), failing())));
  }

  pieces(): Observable<readonly Piece[]> {
    return defer(() => {
      this.pieceLoad ??= this.refresh().pipe(defaultIfEmpty(undefined), catchError(() => of(undefined)), shareReplay(1));
      return this.pieceLoad.pipe(switchMap(() => this.all.asObservable()));
    });
  }

  piece(id: string): Observable<PieceDetail> {
    return this.read(id);
  }

  create(song: Song, choices: Choices): Observable<PieceDetail> {
    return defer(() => {
      const problems = validateChoices(choices);
      if (problems.length) return throwError(() => new AnimationFailure('refused', `these choices are not accepted: ${problems.join(', ')}`));
      return this.api.post(PIECES, { body: toRequest(song, choices, this.client) }).pipe(
        map((made) => toDetail(made, this.urlOf)),
        tap((made) => {
          this.put(made);
          this.schedule();
        }),
        failing(),
      );
    });
  }

  saveDesign(id: string, design: Design): Observable<PieceDetail> {
    return defer(() => this.api.put('/api/music-motion/pieces/{id}/design', { path: { id }, body: fromDesign(design) })).pipe(
      failing(),
      switchMap(() => this.read(id)),
    );
  }

  saveScript(id: string, script: Script): Observable<PieceDetail> {
    return defer(() => this.api.put('/api/music-motion/pieces/{id}/script', { path: { id }, body: fromScript(script) })).pipe(
      failing(),
      switchMap(() => this.read(id)),
    );
  }

  propose(id: string, input: ProposeInput & { readonly what: 'design' | 'script' }): Observable<Proposal> {
    return defer(() => this.api.post('/api/music-motion/pieces/{id}/propose', { path: { id }, body: fromPropose(input) })).pipe(
      failing(),
      switchMap((answer) => this.read(id).pipe(map((piece) => toProposal(answer as ServerProposal, piece)))),
    );
  }

  proposeAll(id: string, input: Omit<ProposeInput, 'what'>): Observable<PieceDetail> {
    return defer(() => this.api.post('/api/music-motion/pieces/{id}/propose', { path: { id }, body: fromPropose({ ...input, what: 'all' }, true) })).pipe(
      failing(),
      switchMap(() => this.read(id)),
    );
  }

  followProposal(id: string): Observable<PieceDetail> {
    const same = (a: PieceDetail, b: PieceDetail): boolean => JSON.stringify(a.proposal) === JSON.stringify(b.proposal);
    return defer(() =>
      timer(0, this.pollMs).pipe(
        switchMap(() => this.read(id)),
        distinctUntilChanged(same),
        takeWhile((piece) => isProposing(piece), true),
      ),
    );
  }

  writeScenes(id: string, input: SceneInput = {}): Observable<SceneBatch> {
    return defer(() => this.api.post('/api/music-motion/pieces/{id}/scenes', { path: { id }, body: fromSceneInput(input) as never })).pipe(map(toSceneBatch), failing());
  }

  followScenes(id: string): Observable<SceneBatch> {
    const over = (b: SceneBatch): boolean => b.state !== 'writing';
    return defer(() =>
      timer(0, this.pollMs).pipe(
        switchMap(() => this.read(id)),
        map((piece) => piece.scenes),
        filter((b): b is SceneBatch => !!b),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeWhile((b) => !over(b), true),
      ),
    );
  }

  cancelScenes(id: string): Observable<SceneBatch> {
    return defer(() => this.api.delete('/api/music-motion/pieces/{id}/scenes', { path: { id } })).pipe(map((b) => toSceneBatch(b as never)), failing());
  }

  approveScenes(id: string): Observable<SceneApproval> {
    return defer(() => this.api.post('/api/music-motion/pieces/{id}/scenes/approve', { path: { id } })).pipe(
      map((a) => toSceneApproval(a as never)),
      // The script on the server changed: the copy kept here is stale.
      switchMap((approval) => this.read(id).pipe(map(() => approval), catchError(() => of(approval)))),
      failing(),
    );
  }

  reviewPiece(id: string): Observable<PieceReview> {
    return defer(() => this.api.post('/api/music-motion/pieces/{id}/review', { path: { id } })).pipe(map(toPieceReview), failing());
  }

  followReview(id: string): Observable<PieceReview> {
    return defer(() =>
      timer(0, this.pollMs).pipe(
        switchMap(() => this.read(id)),
        map((piece) => piece.review),
        filter((r): r is PieceReview => !!r),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeWhile((r) => r.state === 'running', true),
      ),
    );
  }

  assistModels(): Observable<AssistModels> {
    return defer(() => this.api.get('/api/assist/models')).pipe(map(toAssistModels), failing());
  }

  writeSvg(input: SvgInput): Observable<string> {
    const text = input.text.trim();
    if (!text) return throwError(() => new AnimationFailure('refused', 'the description is empty'));
    if ([...text].length > MAX_SVG_TEXT) return throwError(() => new AnimationFailure('refused', `the description is longer than ${MAX_SVG_TEXT} characters`));
    return defer(() => this.api.post('/api/assist/svg', { body: { text, ...(input.model ? { model: input.model } : {}), ...(input.provider ? { provider: input.provider } : {}) } })).pipe(
      map((answer) => answer.svg),
      failing(),
    );
  }

  plan(input: PlanInput): Observable<AssistedPlan> {
    const text = input.text.trim();
    if (!text) return throwError(() => new AnimationFailure('refused', 'the sentence is empty'));
    if ([...text].length > MAX_PLAN_TEXT) return throwError(() => new AnimationFailure('refused', `the sentence is longer than ${MAX_PLAN_TEXT} characters`));
    return defer(() => this.api.post('/api/assist/plan', { body: fromPlanInput(input) })).pipe(map(toAssistedPlan), failing());
  }

  transcribe(id: string): Observable<PieceDetail> {
    return defer(() => this.api.post('/api/music-motion/pieces/{id}/transcribe', { path: { id } })).pipe(
      map((piece) => toDetail(piece, this.urlOf)),
      tap((piece) => this.put(piece)),
      failing(),
    );
  }

  render(id: string): Observable<Estimate> {
    return defer(() => this.api.post('/api/music-motion/pieces/{id}/render', { path: { id } })).pipe(
      map((started) => ({ seconds: started.estimate.seconds, frames: started.estimate.frames })),
      tap(() => this.refresh().subscribe({ error: () => undefined })),
      failing(),
    );
  }

  remove(id: string): Observable<void> {
    return defer(() => this.api.delete(PIECE, { path: { id } })).pipe(
      map(() => this.all.next(this.all.value.filter((p) => p.id !== id))),
      failing(),
    );
  }

  follow(id: string): Observable<Piece> {
    return defer(() =>
      timer(0, this.pollMs).pipe(
        switchMap(() => defer(() => this.api.get(PIECE, { path: { id } })).pipe(catchError((e) => (isMissing(e) ? of(null) : throwError(() => failureOf(e)))))),
        takeWhile((p): p is NonNullable<typeof p> => p !== null),
        map((p) => toPiece(p, this.urlOf)),
        distinctUntilChanged((a, b) => a.state === b.state && a.progress === b.progress),
        tap((p) => this.all.next(this.all.value.map((x) => (x.id === p.id ? p : x)))),
        takeWhile((p) => !isFinished(p), true),
      ),
    );
  }

  // ---------------------------------------------------------------- references

  references(): Observable<readonly Reference[]> {
    return defer(() => {
      this.referenceLoad ??= this.refreshReferences().pipe(defaultIfEmpty(undefined), catchError(() => of(undefined)), shareReplay(1));
      return this.referenceLoad.pipe(switchMap(() => this.refs.asObservable()));
    });
  }

  reference(id: string): Observable<Reference> {
    return defer(() => this.api.get(REFERENCE, { path: { id } })).pipe(
      map((r) => toReference(r, this.urlOf)),
      tap((r) => this.putReference(r)),
      failing(),
    );
  }

  addReference(input: ReferenceInput): Observable<Reference> {
    return defer(() => {
      const problems = validateReferenceInput(input);
      if (problems.length) return throwError(() => new AnimationFailure('refused', `this reference is not accepted: ${problems.join(', ')}`));
      const call = input.file ? this.api.postForm(REFERENCES, toReferenceForm(input)) : this.api.post(REFERENCES, { body: fromReferenceInput(input) as never });
      return call.pipe(
        map((r) => toReference(r, this.urlOf)),
        tap((r) => {
          this.putReference(r);
          this.scheduleReferences();
        }),
        failing(),
      );
    });
  }

  editReference(id: string, patch: ReferencePatch): Observable<Reference> {
    return defer(() => this.api.patch(REFERENCE, { path: { id }, body: fromReferencePatch(patch) })).pipe(
      map((r) => toReference(r, this.urlOf)),
      tap((r) => this.putReference(r)),
      failing(),
    );
  }

  removeReference(id: string): Observable<void> {
    return defer(() => this.api.delete(REFERENCE, { path: { id } })).pipe(
      map(() => this.refs.next(this.refs.value.filter((r) => r.id !== id))),
      failing(),
    );
  }

  private putReference(reference: Reference): void {
    const rest = this.refs.value.filter((r) => r.id !== reference.id);
    this.refs.next([reference, ...rest].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)));
  }

  private refreshReferences(): Observable<void> {
    return defer(() => this.api.get(REFERENCES)).pipe(
      map((list) => {
        this.refs.next(list.references.map((r) => toReference(r, this.urlOf)));
        this.scheduleReferences();
      }),
    );
  }

  /** While a reference is analysing the list is read again every `pollMs`; when none is, it is left alone. */
  private scheduleReferences(): void {
    const pending = this.refs.value.some(isAnalysing);
    if (pending && !this.refPoller) {
      this.refPoller = timer(this.pollMs, this.pollMs)
        .pipe(switchMap(() => this.refreshReferences().pipe(catchError(() => EMPTY))))
        .subscribe();
    } else if (!pending && this.refPoller) {
      this.refPoller.unsubscribe();
      this.refPoller = undefined;
    }
  }

  // ---------------------------------------------------------------- part drafts

  drafts(): Observable<readonly Draft[]> {
    return defer(() => {
      this.draftLoad ??= this.refreshDrafts().pipe(defaultIfEmpty(undefined), catchError(() => of(undefined)), shareReplay(1));
      return this.draftLoad.pipe(switchMap(() => this.draftList.asObservable()));
    });
  }

  draft(id: string): Observable<Draft> {
    return defer(() => this.api.get(DRAFT, { path: { id } })).pipe(
      map((d) => toDraft(d, this.urlOf)),
      tap((d) => this.putDraft(d)),
      failing(),
    );
  }

  askDraft(input: DraftInput): Observable<Draft> {
    return defer(() => {
      const problems = validateDraftInput(input);
      if (problems.length) return throwError(() => new AnimationFailure('refused', `this part is not accepted: ${problems.join(', ')}`));
      const call = input.file ? this.api.postForm(DRAFTS, toDraftForm(input)) : this.api.post(DRAFTS, { body: fromDraftInput(input) as never });
      return call.pipe(
        map((d) => toDraft(d, this.urlOf)),
        tap((d) => {
          this.putDraft(d);
          this.scheduleDrafts();
        }),
        failing(),
      );
    });
  }

  saveDraft(id: string, text: DraftText): Observable<Draft> {
    return defer(() => this.api.put(DRAFT, { path: { id }, body: fromDraftText(text) })).pipe(
      map((d) => toDraft(d, this.urlOf)),
      tap((d) => this.putDraft(d)),
      failing(),
    );
  }

  createDraftFromText(text: DraftText): Observable<Draft> {
    return defer(() => this.api.post(DRAFTS, { body: fromDraftText(text) as never })).pipe(
      map((d) => toDraft(d, this.urlOf)),
      tap((d) => this.putDraft(d)),
      failing(),
    );
  }

  retryDraft(id: string): Observable<Draft> {
    return defer(() => this.api.post('/api/music-motion/part-drafts/{id}/retry', { path: { id } })).pipe(
      map((d) => toDraft(d, this.urlOf)),
      tap((d) => {
        this.putDraft(d);
        this.scheduleDrafts();
      }),
      failing(),
    );
  }

  approveDraft(id: string): Observable<Part> {
    return defer(() => this.api.post('/api/music-motion/part-drafts/{id}/approve', { path: { id } })).pipe(
      map(toPart),
      tap((part) => {
        // The part is in the server's catalog now: put it in the one kept here too, in place of a part of the same name.
        if (this.catalogNow) this.catalogNow = { ...this.catalogNow, parts: [...this.catalogNow.parts.filter((p) => p.name !== part.name), part] };
        this.draftList.next(this.draftList.value.filter((d) => d.id !== id));
      }),
      failing(),
    );
  }

  partText(name: string): Observable<PartText> {
    return defer(() => this.api.get('/api/music-motion/parts/{name}', { path: { name } })).pipe(
      map((p) => ({ name: p.name, manifest: JSON.stringify(p.manifest), fragment: p.fragment })),
      failing(),
    );
  }

  replacePart(name: string, text: DraftText): Observable<Part> {
    return defer(() => this.api.put('/api/music-motion/parts/{name}', { path: { name }, body: fromDraftText(text) })).pipe(
      map(toPart),
      tap((part) => {
        if (this.catalogNow) this.catalogNow = { ...this.catalogNow, parts: this.catalogNow.parts.map((p) => (p.name === part.name ? part : p)) };
      }),
      failing(),
    );
  }

  removePart(name: string, force = false): Observable<void> {
    return defer(() => this.api.delete('/api/music-motion/parts/{name}', { path: { name }, ...(force ? { query: { force: true } } : {}) })).pipe(
      map(() => {
        if (this.catalogNow) this.catalogNow = { ...this.catalogNow, parts: this.catalogNow.parts.filter((p) => p.name !== name) };
      }),
      failing(),
    );
  }

  previewPages(id: string, input: { readonly design?: Design; readonly script?: Script; readonly scenes?: readonly string[] } = {}): Observable<PiecePreview> {
    const body = { ...(input.design ? { design: fromDesign(input.design) } : {}), ...(input.script ? { script: fromScript(input.script) } : {}) };
    const query = input.scenes && input.scenes.length > 0 ? { scenes: input.scenes.join(',') } : undefined;
    return defer(() => this.api.post('/api/music-motion/pieces/{id}/preview', { path: { id }, body, ...(query ? { query } : {}) })).pipe(
      map((p) => ({ width: p.width, height: p.height, fps: p.fps, scenes: p.scenes.map((s) => ({ id: s.id, start: s.start, end: s.end, html: s.html })), replacements: p.replacements })),
      failing(),
    );
  }

  removeDraft(id: string): Observable<void> {
    return defer(() => this.api.delete(DRAFT, { path: { id } })).pipe(
      map(() => this.draftList.next(this.draftList.value.filter((d) => d.id !== id))),
      failing(),
    );
  }

  private putDraft(draft: Draft): void {
    const rest = this.draftList.value.filter((d) => d.id !== draft.id);
    this.draftList.next([draft, ...rest].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)));
  }

  private refreshDrafts(): Observable<void> {
    return defer(() => this.api.get(DRAFTS)).pipe(
      map((answer) => {
        this.draftList.next(answer.drafts.map((d) => toDraft(d, this.urlOf)));
        this.scheduleDrafts();
      }),
    );
  }

  /** While a draft is being written the list is read again every `pollMs`; when none is, it is left alone. */
  private scheduleDrafts(): void {
    const pending = this.draftList.value.some(isWriting);
    if (pending && !this.draftPoller) {
      this.draftPoller = timer(this.pollMs, this.pollMs)
        .pipe(switchMap(() => this.refreshDrafts().pipe(catchError(() => EMPTY))))
        .subscribe();
    } else if (!pending && this.draftPoller) {
      this.draftPoller.unsubscribe();
      this.draftPoller = undefined;
    }
  }

  // ---------------------------------------------------------------- presets

  presets(): Observable<readonly Preset[]> {
    return defer(() => this.api.get(PRESETS)).pipe(
      map((answer) => answer.presets.map(toPreset)),
      failing(),
    );
  }

  preset(id: string): Observable<Preset> {
    return defer(() => this.api.get(PRESET, { path: { id } })).pipe(map(toPreset), failing());
  }

  makePreset(referenceId: string, name?: string): Observable<Preset> {
    return defer(() => this.api.post(PRESETS, { body: { reference_id: referenceId, ...(name?.trim() ? { name: name.trim() } : {}) } })).pipe(map(toPreset), failing());
  }

  savePreset(id: string, preset: PresetInput): Observable<Preset> {
    return defer(() => this.api.put(PRESET, { path: { id }, body: fromPreset(preset) })).pipe(map(toPreset), failing());
  }

  removePreset(id: string): Observable<void> {
    return defer(() => this.api.delete(PRESET, { path: { id } })).pipe(
      map(() => undefined),
      failing(),
    );
  }

  // ---------------------------------------------------------------- learning

  learn(referenceId: string, strictness?: Strictness): Observable<Learning> {
    return defer(() => this.api.post(LEARN, { path: { id: referenceId }, ...(strictness ? { body: { strictness } } : {}) } as never) as Observable<ServerLearning>).pipe(map(toLearning), failing());
  }

  learning(id: string): Observable<Learning> {
    return defer(() => this.api.get(LEARNING, { path: { id } })).pipe(map(toLearning), failing());
  }

  learnings(referenceId?: string): Observable<readonly Learning[]> {
    return defer(() => this.api.get(LEARNINGS, { query: { ...(referenceId ? { reference_id: referenceId } : {}) } } as never) as Observable<{ learnings: ServerLearning[] }>).pipe(
      map((answer) => answer.learnings.map(toLearning)),
      failing(),
    );
  }

  /** One piece with everything; the list's copy of it is brought up to date. */
  private read(id: string): Observable<PieceDetail> {
    return defer(() => this.api.get(PIECE, { path: { id } })).pipe(
      map((p) => toDetail(p, this.urlOf)),
      tap((piece) => this.put(piece)),
      failing(),
    );
  }

  private put(piece: Piece): void {
    const { id, title, state, progress, source, style, level, fps, width, height, createdAt, estimate, sizeBytes, video, error } = piece;
    const entry: Piece = { id, title, state, progress, source, style, level, fps, width, height, createdAt, estimate, sizeBytes, ...(video ? { video } : {}), ...(error ? { error } : {}) };
    const rest = this.all.value.filter((p) => p.id !== id);
    this.all.next([entry, ...rest].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)));
  }

  private refresh(): Observable<void> {
    return defer(() => this.api.get(PIECES)).pipe(
      map((list) => {
        this.all.next(list.map((p) => toPiece(p, this.urlOf)));
        this.schedule();
      }),
    );
  }

  /** While anything is unfinished the list is read again every `pollMs`; when nothing is, it is left alone. */
  private schedule(): void {
    const pending = this.all.value.some(isBusy);
    if (pending && !this.poller) {
      this.poller = timer(this.pollMs, this.pollMs)
        .pipe(switchMap(() => this.refresh().pipe(catchError(() => EMPTY))))
        .subscribe();
    } else if (!pending && this.poller) {
      this.poller.unsubscribe();
      this.poller = undefined;
    }
  }
}

const isMissing = (e: unknown): boolean => (failureOf(e) as { kind?: string }).kind === 'missing';
