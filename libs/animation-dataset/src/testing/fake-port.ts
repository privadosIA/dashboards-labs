import { type Observable, of, throwError } from 'rxjs';

import { AnimationFailure, type AnimationPort, Catalog, Choices, Design, Draft, DraftInput, DraftText, Part, PartText, Piece, PieceDetail, Preset, PresetInput, Reference, ReferenceInput, Script, Song, SongMap } from '@lab/animation-core';
import { CATALOG } from '@lab/animation-core/testing';

/** The songs the fake port offers. Both are 48 seconds long, so a golden script fits either. */
export const FAKE_SONGS: readonly Song[] = [
  { key: 'demo-musica/track-1/0', project: 'demo-musica', trackId: 'track-1', variant: 0, title: 'Quiet Town', seconds: 48, instrumental: false },
  { key: 'morning-light/track-1/0', project: 'morning-light', trackId: 'track-1', variant: 0, title: 'Morning Light', seconds: 36, instrumental: false },
];

/** The shared test catalog as a server that takes keyframes and layers says it: the features, and `counter`'s `to` and `speed` animatable. */
export const FAKE_CATALOG: Catalog = {
  ...CATALOG,
  features: ['animate', 'layers'],
  parts: CATALOG.parts.map((p) => (p.name === 'counter' ? { ...p, params: p.params.map((q) => ({ ...q, animatable: true })) } : p)),
};

const DESIGN: Design = { dark: '#101018', light: '#f4f1ea', accent: '#ff5a3c', display: 'Space Grotesk', body: 'Inter', defaultMode: 'dark', modes: {}, concept: '' };

const mapOf = (seconds: number): SongMap => ({ duration: seconds, bpm: 96, beats: [], beatBase: 0, gridAnchored: true, sections: [], words: [], wordsEstimated: false, loudnessHop: 0.1, loudness: [] });

const unsupported = (what: string) => (): Observable<never> => throwError(() => new Error(`the fake port does not do "${what}"`));

/**
 * A small port that keeps everything in memory and answers at once: enough to import a dataset and export it again without the in-memory
 * adapter of `@lab/music-motion`, so this library's specs depend on nothing above it. References are ready as soon as they are added,
 * drafts are ready as soon as they are asked, and nothing is approved.
 */
export class FakePort implements AnimationPort {
  private seq = 0;
  private readonly pieceMap = new Map<string, PieceDetail>();
  private readonly referenceMap = new Map<string, Reference>();
  private readonly presetMap = new Map<string, Preset>();
  private readonly draftMap = new Map<string, Draft>();

  private catalogValue: Catalog;

  constructor(private readonly songList: readonly Song[] = FAKE_SONGS, catalog: Catalog = FAKE_CATALOG) {
    this.catalogValue = catalog;
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  songs = (): Observable<readonly Song[]> => of(this.songList);
  catalog = (): Observable<Catalog> => of(this.catalogValue);
  pieces = (): Observable<readonly Piece[]> => of([...this.pieceMap.values()]);
  piece = (id: string): Observable<PieceDetail> => (this.pieceMap.has(id) ? of(this.pieceMap.get(id)!) : throwError(() => new Error(`no piece ${id}`)));

  create(song: Song, choices: Choices): Observable<PieceDetail> {
    const [width, height] = choices.resolution.split('x').map(Number);
    const piece: PieceDetail = {
      id: this.id('piece'),
      title: song.title,
      state: 'draft',
      progress: 0,
      source: { project: song.project, trackId: song.trackId, variant: song.variant },
      style: choices.style,
      level: choices.level,
      fps: choices.fps,
      width,
      height,
      createdAt: 0,
      estimate: { seconds: 0, frames: 0 },
      sizeBytes: 0,
      design: { design: DESIGN, source: 'fallback', edited: false },
      script: { version: 1, pieces: [] },
      scriptSource: 'fallback',
      songMap: mapOf(song.seconds),
      ...(choices.presetId ? { preset: choices.presetId } : {}),
    };
    this.pieceMap.set(piece.id, piece);
    return of(piece);
  }

  private update(id: string, change: Partial<PieceDetail>): Observable<PieceDetail> {
    const next = { ...this.pieceMap.get(id)!, ...change };
    this.pieceMap.set(id, next);
    return of(next);
  }

  saveDesign = (id: string, design: Design): Observable<PieceDetail> => this.update(id, { design: { design, source: 'user', edited: true } });
  saveScript = (id: string, script: Script): Observable<PieceDetail> => this.update(id, { script, scriptSource: 'user' });

  references = (): Observable<readonly Reference[]> => of([...this.referenceMap.values()]);
  reference = (id: string): Observable<Reference> => of(this.referenceMap.get(id)!);
  addReference(input: ReferenceInput): Observable<Reference> {
    const r: Reference = { id: this.id('ref'), title: input.title ?? '', notes: input.notes ?? '', tags: input.tags ?? [], ...(input.url ? { source: input.url } : {}), state: 'ready', createdAt: 0 };
    this.referenceMap.set(r.id, r);
    return of(r);
  }

  presets = (): Observable<readonly Preset[]> => of([...this.presetMap.values()]);
  preset = (id: string): Observable<Preset> => of(this.presetMap.get(id)!);
  makePreset(referenceId: string, name?: string): Observable<Preset> {
    const p: Preset = { id: this.id('preset'), name: name ?? 'style', referenceId, createdAt: 0, design: DESIGN, rhythm: 6, parts: [], adjustments: [] };
    this.presetMap.set(p.id, p);
    return of(p);
  }
  savePreset(id: string, input: PresetInput): Observable<Preset> {
    const p: Preset = { ...this.presetMap.get(id)!, ...input };
    this.presetMap.set(id, p);
    return of(p);
  }

  drafts = (): Observable<readonly Draft[]> => of([...this.draftMap.values()]);
  draft = (id: string): Observable<Draft> => of(this.draftMap.get(id)!);
  askDraft(input: DraftInput): Observable<Draft> {
    const d: Draft = { id: this.id('draft'), state: 'ready', request: input.request, withPicture: false, attempts: 1, problems: [], createdAt: 0, preview: [] };
    this.draftMap.set(d.id, d);
    return of(d);
  }
  saveDraft(id: string, text: DraftText): Observable<Draft> {
    const name = (JSON.parse(text.manifest) as { name?: string }).name;
    const d: Draft = { ...this.draftMap.get(id)!, manifest: text.manifest, fragment: text.fragment, ...(name ? { name } : {}) };
    this.draftMap.set(id, d);
    return of(d);
  }

  /** A draft made from a text, with no assistant: ready at once, with its name and its texts. */
  createDraftFromText(text: DraftText): Observable<Draft> {
    const name = (JSON.parse(text.manifest) as { name?: string }).name;
    const d: Draft = { id: this.id('draft'), state: 'ready', request: name ?? '', withPicture: false, attempts: 1, problems: [], createdAt: 0, preview: [], manifest: text.manifest, fragment: text.fragment, ...(name ? { name } : {}) };
    this.draftMap.set(d.id, d);
    return of(d);
  }

  /** A ready draft becomes a part of the user's, as the server does when its owner approves it. */
  approveDraft(id: string): Observable<Part> {
    const d = this.draftMap.get(id)!;
    const scene = d.manifest ? (JSON.parse(d.manifest) as { scene?: { piece: string; script_piece: string } }).scene : undefined;
    const part: Part = { name: d.name ?? id, description: d.description ?? d.request, levels: ['simple', 'medium', 'advanced'], costMs: 50, manual: false, params: [], source: 'user', ...(scene ? { verse: 'own' as const, scene: { piece: scene.piece, scriptPiece: scene.script_piece } } : {}) };
    this.catalogValue = { ...this.catalogValue, parts: [...this.catalogValue.parts, part] };
    return of(part);
  }

  partText(name: string): Observable<PartText> {
    const d = [...this.draftMap.values()].find((x) => x.name === name && x.manifest && x.fragment);
    const approved = this.catalogValue.parts.some((p) => p.name === name && p.source === 'user');
    return d && approved ? of({ name, manifest: d.manifest!, fragment: d.fragment! }) : throwError(() => new AnimationFailure('missing', `no part "${name}" of the user's`));
  }

  propose = unsupported('propose');
  proposeAll = unsupported('proposeAll');
  followProposal = unsupported('followProposal');
  writeScenes = unsupported('writeScenes');
  followScenes = unsupported('followScenes');
  cancelScenes = unsupported('cancelScenes');
  approveScenes = unsupported('approveScenes');
  reviewPiece = unsupported('reviewPiece');
  followReview = unsupported('followReview');
  assistModels = unsupported('assistModels');
  writeSvg = unsupported('writeSvg');
  plan = unsupported('plan');
  transcribe = unsupported('transcribe');
  render = unsupported('render');
  editReference = unsupported('editReference');
  removeReference = unsupported('removeReference');
  retryDraft = unsupported('retryDraft');
  remove(id: string): Observable<void> {
    this.pieceMap.delete(id);
    return of(undefined);
  }
  replacePart = unsupported('replacePart');
  removePart = unsupported('removePart');
  removeDraft = unsupported('removeDraft');
  removePreset = unsupported('removePreset');
  learn = unsupported('learn');
  learning = unsupported('learning');
  learnings = unsupported('learnings');
  follow = unsupported('follow');
}
