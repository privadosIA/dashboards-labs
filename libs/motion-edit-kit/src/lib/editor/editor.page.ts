import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnDestroy, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, forkJoin, of, Subscription, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AnimationFailure, addExtra, addItem, addLayerWithItem, addLine, clearAnimate, clearLayers, duplicateItem, moveItem, resizeItem, emptyPiece, hasLayersFeature, itemPartProblem, layerEditProblem, layerOf, newItemRange, removeItem, removeItemKeyframe, removeKeyframe, isBusy, isEmptyPiece, isProposing, newPieceId, pieceOf, removeExtra, removeLine, removePiece, setPart, splitPiece, type Catalog, type PieceDetail, type PieceReview, type SceneApproval, type SceneBatchDraft, verdictOf, type Script, type Song } from '@lab/animation-core';
import { EditorStore, MOTION_EDITOR_LANG, scenesUsing, sliceSongMap, beatOfSlice, loudnessOfSlice, clearDraft, readDraft, summarizeDraft, worthOffering, writeDraft, type Draft, checkDoc, motionEditorTexts, sameSelection, warningText, type TimelineEdit, FragmentSource, FrameHost, LocalPageSource, ServerPageSource, type PageSource, MotionLayers, MotionTimeline, PartsPalette, PreviewClock, Transport, transportKey, type Doc, type DropLane, type ItemSelection, type PaletteItem, type ScenePage, type Selection } from '@lab/motion-editor';
import { declarationsFor } from '@lab/motion-editor/code';
import { ANIMATION } from '@lab/music-motion';
import type { VectorDocument } from '@lab/vector-editor';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../core/language';
import { sceneTextsFor } from './scenes/texts';
import { MOTION_EDIT_BASE } from '../core/options';
import { textsFor } from '../core/texts';
import { Actions } from './actions/actions';
import { FlowBar } from './flow-bar/flow-bar';
import { CodePane } from './code/code-pane/code-pane';
import { CodeSync, type CodeInputs } from './code/code-sync';
import { AUDIO_FACTORY } from './audio';
import type { EditRequest } from './inspector/edit';
import { HelpDialog } from './help/help-dialog';
import { NewPartDialog } from './new-part/new-part-dialog';
import { Inspector } from './inspector/inspector';
import { Collapsible } from '../shared/collapsible/collapsible';
import { PreviewModal } from './preview-modal/preview-modal';
import { hasReviewFeature, hasSceneFeature } from './scenes/features';
import { SceneDialog, type SceneApproved, type SceneTarget } from './scenes/scene-dialog/scene-dialog';
import { ReviewPanel } from './scenes/review-panel/review-panel';
import { ScenesStrip, type PrepareApproval } from './scenes/scenes-strip/scenes-strip';
import { VectorLeave, type LeaveAnswer } from './vector/leave-dialog/leave-dialog';
import { NewVectorPart } from './vector/new-vector-part/new-vector-part';
import { selectedBlock, type Block } from './vector/selected-block';
import { VectorSession, documentOfPart, documentOfSvg } from './vector/vector-session';
import { VectorTab, type VectorSaved } from './vector/vector-tab/vector-tab';

/** How long after the last change the draft is kept in the browser. */
const DRAFT_DELAY_MS = 3000;

/**
 * Opens one piece by id: its layers on the left, the preview with its transport in the middle, the inspector on the right and the timeline
 * below. It holds the document being edited (with its history), the selection and the playhead; every edit is previewed at once and nothing
 * reaches the server until Save. It follows the piece while it is drawn or a proposal is written, and edits nothing then.
 */
@Component({
  selector: 'app-editor-page',
  imports: [Actions, CodePane, Collapsible, FlowBar, FrameHost, HelpDialog, NewPartDialog, Inspector, MotionLayers, MotionTimeline, PartsPalette, PreviewModal, ReviewPanel, RouterLink, SceneDialog, ScenesStrip, Transport, NewVectorPart, VectorLeave, VectorTab],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'motion-edit-kit' },
})
export class EditorPage implements OnDestroy {
  private readonly port = inject(ANIMATION);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly base = inject(MOTION_EDIT_BASE);
  private readonly tickets = inject(TicketService);
  private readonly makeAudio = inject(AUDIO_FACTORY);
  private readonly destroyed = inject(DestroyRef);
  private readonly language = inject(LanguageService).lang;
  protected readonly list = `${inject(MOTION_EDIT_BASE)}/pieces`;
  protected readonly texts = textsFor(this.language);
  protected readonly t = this.texts.editor;

  /** What the page is doing: the piece is on its way, it is not there, or it failed to open. */
  protected readonly status = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  protected readonly id = signal('');
  protected readonly failure = signal('');
  protected readonly piece = signal<PieceDetail | null>(null);
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly pages = signal<readonly ScenePage[]>([]);
  protected readonly selection = signal<Selection | null>(null);
  /** An item of a layer, selected apart from the pieces: choosing one clears the other. */
  protected readonly itemSelection = signal<ItemSelection | null>(null);
  protected readonly hidden = signal<ReadonlySet<string>>(new Set());
  protected readonly zoom = signal(40);
  /** The document being edited and what the server has, with the history. `null` until a piece is open. */
  protected readonly store = signal<EditorStore | null>(null);
  protected readonly saving = signal(false);
  protected readonly justSaved = signal(false);
  /** Why the server refused each piece of the script, by id, and the design, in its own words. */
  protected readonly refusedPieces = signal<Readonly<Record<string, string>>>({});
  protected readonly refusedDesign = signal('');
  protected readonly saveProblem = signal('');
  /** A short message about something that could not be done (a part the piece already has, a piece too short to split). */
  protected readonly notice = signal('');
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  /** The preview is open in its own window; it shares the clock with the small one, so closing it changes nothing else. */
  protected readonly previewOpen = signal(false);
  /** The left column holds the pieces and the library, one at a time; both stay drawn so that the search and the scroll are kept. */
  protected readonly sideTab = signal<'layers' | 'library'>('layers');
  protected readonly stageOpen = signal(true);
  protected readonly helpOpen = signal(false);
  /** The window that makes a new part is open. */
  protected readonly newPartOpen = signal(false);
  // — scenes —

  /** The scene dialog: open, the block it is for, the draft to look at (opened from a card) and the part whose texts are edited. */
  protected readonly sceneOpen = signal(false);
  protected readonly sceneTarget = signal<SceneTarget | null>(null);
  protected readonly sceneDraft = signal<string | null>(null);
  protected readonly sceneEditing = signal<string | null>(null);
  protected readonly sceneOn = computed(() => hasSceneFeature(this.catalog()));
  protected readonly reviewOn = computed(() => hasReviewFeature(this.catalog()));
  /** The last review of the piece (the server's, or the one that was just asked for): its grades are marks on the blocks and its notes are in the inspector. */
  protected readonly review = signal<PieceReview | null>(null);
  private readonly ts = sceneTextsFor(this.language);
  protected readonly grades = computed<Readonly<Record<string, { verdict: 'pass' | 'weak' | 'fail'; text: string }>>>(() => {
    const r = this.review();
    if (!r || r.state !== 'done') return {};
    const out: Record<string, { verdict: 'pass' | 'weak' | 'fail'; text: string }> = {};
    for (const s of r.scenes) {
      if (s.error) continue;
      const verdict = s.verdict ?? verdictOf(s.score);
      out[s.scriptPiece] = { verdict, text: [`${this.ts.review.block(s.scriptPiece)}: ${this.ts.draft.score(s.score)} · ${this.ts.review.mark[verdict]}`, ...s.notes.slice(0, 1)].join(' — ') };
    }
    return out;
  });
  /** Cuts dragged on the timeline land on the beat while this is on (M toggles it). */
  protected readonly magnet = signal(true);
  protected readonly clock = new PreviewClock({ refresh: () => this.refreshAudio() });
  /** Which view of the document is shown: the visual editor, the script written as code, or the vector part of the chosen block. */
  protected readonly view = signal<'visual' | 'code' | 'vector'>('visual');
  /** The code pane (and Monaco with it) is made the first time Code is shown, and kept after that. */
  protected readonly codeOpened = signal(false);

  // — the Vector tab —

  /** The vector part being edited: its document and history, apart from the script's. It is kept while the tab is out of sight. */
  protected readonly vector = new VectorSession();
  /** The block the chosen part is in: what the Vector tab is enabled by. */
  private readonly block = computed<Block | null>(() => {
    const doc = this.doc();
    return doc ? selectedBlock(doc.script, this.selection(), this.itemSelection()) : null;
  });
  /** What is known of the chosen block's part: read through the fragment source, once, and whether it carries a vector model. */
  protected readonly probe = signal<{ readonly part: string; readonly state: 'loading' | 'vector' | 'not'; readonly doc?: VectorDocument } | null>(null);
  private probeRun: Subscription | undefined;
  /** The stretch of the song the vector part was opened for: its beats and loudness are the canvas's. */
  private readonly vectorBlock = signal<Block | null>(null);
  private readonly vectorSlice = computed(() => {
    const b = this.vectorBlock();
    const map = this.piece()?.songMap;
    return b && map ? sliceSongMap(map, b.start, b.end) : null;
  });
  protected readonly vectorBeatAt = computed(() => {
    const slice = this.vectorSlice();
    return slice ? (t: number) => beatOfSlice(slice, t) : undefined;
  });
  protected readonly vectorLoudnessAt = computed(() => {
    const slice = this.vectorSlice();
    return slice && slice.loudness.length ? (t: number) => loudnessOfSlice(slice, t) ?? 0 : undefined;
  });
  protected readonly vectorUses = computed(() => {
    const doc = this.doc();
    const name = this.vector.partName();
    return doc && name ? scenesUsing(doc.script, name).length : 0;
  });
  /** Whether the tab can be opened: the chosen part carries a vector model, or a vector part is already open in it. */
  protected readonly vectorEnabled = computed(() => this.vector.open() || this.probe()?.state === 'vector');
  /** Why the tab is off, for its tooltip. */
  protected readonly vectorOff = computed(() => {
    if (this.vectorEnabled()) return '';
    const p = this.probe();
    const v = textsFor(this.language).vector.off;
    return !this.block() ? v.noBlock : p?.state === 'loading' ? v.loading : v.notVector;
  });
  /** Who the question about unsaved vector changes is about; the dialog is open while it is set. */
  protected readonly vectorAsk = signal<{ readonly what: string; readonly done: (answer: LeaveAnswer) => void } | null>(null);
  /** What to do once the vector part is saved, because the person chose Save when asked. */
  private afterVectorSave: (() => void) | null = null;
  /** What to do if the save window is closed without saving: stay. */
  private stayAfterClose: (() => void) | null = null;
  protected readonly vectorTab = viewChild(VectorTab);

  protected readonly busy = computed(() => (this.piece() ? isBusy(this.piece()!) : false));
  protected readonly proposing = computed(() => (this.piece() ? isProposing(this.piece()!) : false));
  protected readonly locked = computed(() => this.busy() || this.proposing());
  /** Why a visual edit is refused: the server is busy with the piece (it is not saved over), or the code has errors (the document waits for it). */
  protected readonly frozen = computed(() => this.locked() || this.pausedByCode());
  protected readonly doc = computed<Doc | null>(() => this.store()?.doc() ?? null);
  private readonly songMap = computed(() => this.piece()?.songMap ?? null);
  private readonly level = computed(() => this.piece()?.level ?? null);
  /** What the code is checked against: the catalog and the song of the piece. The same object until one of them changes. */
  private readonly codeInputs = computed<CodeInputs | null>(() => {
    const catalog = this.catalog();
    const songMap = this.songMap();
    const level = this.level();
    return catalog && songMap && level ? { catalog, songMap, level } : null;
  });
  /** The two views of the document: the code is a text that maps to the script, and the script is the truth. */
  protected readonly sync = new CodeSync({ doc: () => this.doc(), inputs: () => this.codeInputs(), apply: (script) => this.onEdit({ fn: (d) => ({ ...d, script }), label: 'code' }) });
  protected readonly pausedByCode = computed(() => this.codeOpened() && this.sync.paused());
  /** The declarations TypeScript checks the code against: regenerated when the catalog or the song change. */
  protected readonly declarations = computed(() => {
    const inputs = this.codeInputs();
    return inputs ? declarationsFor(inputs.catalog, inputs.songMap) : '';
  });
  /** Where the selected piece (or its extra part) is in the code, for the pane to highlight. */
  protected readonly codeHighlight = computed(() => {
    const sel = this.selection();
    const site = sel ? this.sync.sites().find((x) => x.id === sel.piece) : undefined;
    if (!sel || !site) return null;
    return (sel.extra !== undefined ? site.extras[sel.extra] : undefined) ?? site.range;
  });
  protected readonly codeWarnings = computed(() => this.sync.diagnostics().filter((d) => d.severity === 'warning').length);
  /** What the live checks find in the draft: marks on the blocks, lines in the inspector. The server's answer wins. */
  protected readonly warnings = computed(() => {
    const doc = this.doc();
    const piece = this.piece();
    const catalog = this.catalog();
    return doc && piece && catalog ? checkDoc(doc, piece.songMap, catalog, piece.level) : [];
  });
  private readonly tm = motionEditorTexts(inject(MOTION_EDITOR_LANG));
  /** The script leaves a gap or overlaps: it is about the song, not a block, so it is said above. */
  protected readonly coverageWarning = computed(() => {
    const w = this.warnings().find((x) => x.kind === 'coverage');
    return w ? warningText(this.tm, w) : '';
  });
  /** The document has keyframes and the server does not take them: Save waits, and says why. */
  protected readonly animateBlocked = computed(() => this.warnings().some((w) => w.kind === 'animate-unsupported'));
  /** The document has layers and the server does not take them: Save waits, and says why. */
  protected readonly layersBlocked = computed(() => this.warnings().some((w) => w.kind === 'layers-unsupported'));
  /** The chosen piece is an empty slot: removing it closes the gap instead of emptying it. */
  protected readonly selectedEmpty = computed(() => {
    const sel = this.selection();
    const piece = sel && sel.extra === undefined && sel.line === undefined ? this.doc()?.script.pieces.find((p) => p.id === sel.piece) : undefined;
    return piece ? isEmptyPiece(piece) : false;
  });
  /** Why each part of the library cannot be the selected item's part, in the server's words: they are dimmed there. */
  protected readonly unavailableParts = computed<Readonly<Record<string, string>>>(() => {
    const sel = this.itemSelection();
    const doc = this.doc();
    const catalog = this.catalog();
    if (!sel || !doc || !catalog) return {};
    const out: Record<string, string> = {};
    for (const p of catalog.parts) {
      const why = itemPartProblem(doc.script, sel.layer, sel.item, p.name, catalog);
      if (why) out[p.name] = why;
    }
    return out;
  });
  protected readonly dirty = computed(() => this.store()?.dirty() ?? false);
  protected readonly canUndo = computed(() => this.store()?.canUndo() ?? false);
  protected readonly canRedo = computed(() => this.store()?.canRedo() ?? false);

  private readonly fragments = new FragmentSource(this.port);
  private readonly local = new LocalPageSource(this.fragments);
  /** With a server that builds the pages (`POST /preview`) they come from it, exact; the browser's own builder answers when it cannot. */
  private readonly remote = this.port.previewPages ? new ServerPageSource((input) => this.port.previewPages!(this.id(), input), this.local) : null;
  private readonly source: PageSource = this.remote ?? this.local;
  /** Why the server's pages were not used (an edit it refuses, for instance), shown above the picture. */
  protected readonly previewProblem = signal<string | null>(null);
  /** A draft kept in the browser from an earlier visit, offered until it is restored or dismissed. */
  protected readonly draft = signal<Draft | null>(null);
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  private song: Song | undefined;
  private pagesRun: Subscription | undefined;
  private followRun: Subscription | undefined;

  constructor() {
    this.route.paramMap
      .pipe(
        map((p) => p.get('id') ?? ''),
        switchMap((id) => {
          this.reset(id);
          return forkJoin({ piece: this.port.piece(id), catalog: this.port.catalog(id), songs: this.port.songs() }).pipe(
            map((loaded) => ({ ok: true as const, ...loaded })),
            catchError((e: unknown) => of({ ok: false as const, error: e })),
          );
        }),
        takeUntilDestroyed(this.destroyed),
      )
      .subscribe((result) => {
        if (!result.ok) {
          const missing = result.error instanceof AnimationFailure && result.error.kind === 'missing';
          this.failure.set(result.error instanceof Error ? result.error.message : this.texts.unknownError);
          this.status.set(missing ? 'missing' : 'failed');
          return;
        }
        this.catalog.set(result.catalog);
        this.song = result.songs.find((s) => s.project === result.piece.source.project && s.trackId === result.piece.source.trackId && s.variant === result.piece.source.variant);
        this.show(result.piece);
        const kept = readDraft(result.piece.id);
        if (kept && worthOffering(kept, this.store()!.saved())) this.draft.set(kept);
        else if (kept) clearDraft(result.piece.id);
        this.status.set('ready');
        this.follow(result.piece);
      });

    // The pages are rebuilt when the piece, the catalog or the parts left out change.
    effect(() => {
      const piece = this.piece();
      const catalog = this.catalog();
      const hidden = this.hidden();
      const doc = this.doc();
      if (!piece || !catalog || !doc) return;
      untracked(() => {
        this.pagesRun?.unsubscribe();
        const build = this.source.pages({ piece, design: doc.design, script: doc.script, catalog, hidden });
        const run = this.remote ? timer(150).pipe(switchMap(() => build)) : build;
        this.pagesRun = run.subscribe((pages) => {
          this.pages.set(pages);
          this.previewProblem.set(this.remote?.lastProblem ?? null);
        });
      });
    });

    // What is being edited is kept in the browser a few seconds after the last change, and forgotten once it is saved or thrown away.
    effect(() => {
      const store = this.store();
      const doc = this.doc();
      const dirty = this.dirty();
      if (!store || !doc || this.draft()) return;
      untracked(() => {
        clearTimeout(this.draftTimer);
        const id = this.id();
        if (!dirty) return clearDraft(id);
        this.draftTimer = setTimeout(() => writeDraft(id, { doc, base: store.saved(), at: Date.now() }), DRAFT_DELAY_MS);
      });
    });

    // Choosing a piece clears the item that was chosen, and an item that is no longer in the script is not chosen.
    effect(() => {
      const piece = this.selection();
      const item = this.itemSelection();
      const doc = this.doc();
      untracked(() => {
        if (piece && item) this.itemSelection.set(null);
        else if (item && doc && !layerOf(doc.script, item.layer)?.items[item.item]) this.itemSelection.set(null);
      });
    });

    // The part of the chosen block is read (through the cached fragment source) to know whether the Vector tab can open on it.
    effect(() => {
      const part = this.block()?.part ?? null;
      untracked(() => this.probeVector(part));
    });

    // The code follows the document (and the catalog and the song) once the Code tab has been opened.
    effect(() => {
      if (!this.codeOpened()) return;
      this.doc();
      this.codeInputs();
      untracked(() => {
        this.sync.reconcile();
        if (this.view() === 'code') this.tellReplaced();
      });
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.draftTimer);
    this.pagesRun?.unsubscribe();
    this.followRun?.unsubscribe();
    this.probeRun?.unsubscribe();
    this.sync.destroy();
    this.clock.destroy();
  }

  @HostListener('window:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if (this.status() !== 'ready') return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement | null;
    // The code editor is not an input of the page's (it draws its own editable element): what is typed in it is the code's, and only Save is the page's.
    if (target?.closest?.('.code-pane')) {
      if (mod && key === 's') {
        event.preventDefault();
        void this.save();
      }
      return;
    }
    const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable === true;
    if (mod && key === 's') {
      event.preventDefault();
      void this.save();
    } else if (!typing && this.itemKey(event, key, mod)) {
      // an item of a layer is chosen: its keys were taken
    } else if (mod && !typing && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
    } else if (mod && !typing && key === 'y') {
      event.preventDefault();
      this.redo();
    } else if (!mod && !typing && !event.altKey && key === 's') {
      event.preventDefault();
      this.split();
    } else if (!mod && !typing && (event.key === 'Delete' || event.key === 'Backspace') && (this.selection() !== null || this.itemSelection() !== null)) {
      event.preventDefault();
      this.removeSelected();
    } else if (!mod && !typing && event.key === '?') {
      event.preventDefault();
      this.helpOpen.set(true);
    } else if (!mod && !typing && !event.altKey && key === 'm') {
      event.preventDefault();
      this.magnet.update((m) => !m);
    } else if (event.key === 'Escape' && (this.selection() !== null || this.itemSelection() !== null)) {
      this.selection.set(null);
      this.itemSelection.set(null);
    } else if (transportKey(this.clock, event)) event.preventDefault();
  }

  /** Leaving the page (closing the tab, reloading) with changes that are not saved asks first. */
  @HostListener('window:beforeunload', ['$event'])
  protected onUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() || this.vector.dirty()) event.preventDefault();
  }

  /** Whether leaving the page would lose changes: the route guard asks. */
  hasChanges(): boolean {
    return this.dirty();
  }

  /** Whether the vector part has changes that are not saved: apart from the script's, and asked about apart. */
  hasVectorChanges(): boolean {
    return this.vector.dirty();
  }

  /** The route guard's question about the vector part: true to leave (saved or discarded), false to stay. */
  confirmVectorLeave(): Promise<boolean> {
    return this.askVector().then((answer) => answer !== 'stay');
  }

  private reset(id: string): void {
    this.id.set(id);
    this.status.set('loading');
    this.piece.set(null);
    this.review.set(null);
    this.store.set(null);
    this.refusedPieces.set({});
    this.refusedDesign.set('');
    this.saveProblem.set('');
    this.pages.set([]);
    this.selection.set(null);
    this.itemSelection.set(null);
    this.sync.reset();
    this.vector.close();
    this.vectorBlock.set(null);
    this.probe.set(null);
    clearTimeout(this.draftTimer);
    this.draft.set(null);
    this.followRun?.unsubscribe();
    this.clock.pause();
  }

  /** Puts a piece on screen: the clock learns its length, frame rate and audio the first time, and only its length after. */
  private show(piece: PieceDetail): void {
    const first = this.piece() === null;
    this.piece.set(piece);
    if (piece.review) this.review.set(piece.review);
    const server: Doc = { design: piece.design.design, script: piece.script };
    if (first || !this.store()) this.store.set(new EditorStore(server));
    else this.store()!.replaceSaved(server);
    if (first) {
      const address = this.song?.audio ? this.tickets.withTicket(this.song.audio) : null;
      this.clock.configure(piece.songMap.duration, piece.fps, address ? this.makeAudio(address) : null);
      this.clock.seek(0);
    } else {
      this.clock.configure(piece.songMap.duration, piece.fps);
    }
  }

  /** Follows the piece while it is drawn and a proposal while it is written, and reads it again when they end. */
  private follow(piece: PieceDetail): void {
    this.followRun?.unsubscribe();
    if (isBusy(piece)) {
      this.followRun = this.port.follow(piece.id).subscribe({
        next: (summary) => this.piece.update((p) => (p ? { ...p, ...summary } : p)),
        complete: () => this.reload(),
        error: () => this.reload(),
      });
    } else if (isProposing(piece)) {
      this.followRun = this.port.followProposal(piece.id).subscribe({
        next: (detail) => this.show(detail),
        complete: () => this.reload(true),
        error: () => this.reload(true),
      });
    }
  }

  /** Reads the piece again. When it is a proposal that just ended and the draft has changes, the person chooses: the proposal, or their own changes. */
  private reload(proposalEnded = false): void {
    this.followRun = this.port.piece(this.id()).subscribe({
      next: (p) => {
        const store = this.store();
        const differs = !!store && JSON.stringify({ design: p.design.design, script: p.script }) !== JSON.stringify(store.saved());
        if (proposalEnded && store?.dirty() && differs && confirm(this.texts.editing.proposalAsk)) store.discard();
        this.show(p);
      },
    });
  }

  private async refreshAudio(): Promise<string> {
    await this.tickets.ensure();
    if (!this.song?.audio) throw new Error('no audio');
    return this.tickets.withTicket(this.song.audio);
  }

  /** The server took the render: read the piece again (it is queued now) and follow it. */
  protected onRenderStarted(): void {
    this.followRun?.unsubscribe();
    this.followRun = this.port.piece(this.id()).subscribe({
      next: (p) => {
        this.show(p);
        this.follow(p);
      },
    });
  }

  /** A change asked for by the inspector. Nothing is changed while the server draws or the assistant writes. */
  protected onEdit(request: EditRequest): void {
    if (this.frozen()) {
      if (this.pausedByCode()) this.say(this.texts.code.paused);
      return;
    }
    this.justSaved.set(false);
    this.store()?.apply(request.fn, request.label);
  }

  /** A drag on the timeline: its steps are one entry of the history, a swap is one by itself. */
  protected onTimelineEdit(edit: TimelineEdit): void {
    const store = this.store();
    if (!store || this.frozen()) return;
    const change = edit.change;
    const apply = (doc: Doc): Doc => (change ? { ...doc, script: change(doc.script) } : doc);
    if (edit.phase === 'begin') {
      this.justSaved.set(false);
      store.begin();
    } else if (edit.phase === 'update') store.update(apply);
    else if (edit.phase === 'end') store.end();
    else this.onScriptEdit(apply);
  }

  /** The script changed from the timeline or the layers (a gesture, a split). */
  protected onScriptEdit(fn: (doc: Doc) => Doc, label?: string): void {
    this.onEdit({ fn, ...(label ? { label } : {}) });
  }

  protected undo(): void {
    if (!this.frozen()) this.store()?.undo();
  }

  protected redo(): void {
    if (!this.frozen()) this.store()?.redo();
  }

  /** Takes the draft kept in the browser as the document being edited (one step to undo), and stops offering it. */
  protected restoreDraft(): void {
    const kept = this.draft();
    if (!kept) return;
    this.store()?.apply(() => kept.doc);
    this.draft.set(null);
  }

  protected dismissDraft(): void {
    this.draft.set(null);
    clearDraft(this.id());
  }

  /** What the draft on offer would change and whether the server moved on, for its notice. */
  protected readonly draftSummary = computed(() => {
    const d = this.draft();
    const server = this.store()?.saved();
    return d && server ? summarizeDraft(d, server) : null;
  });

  /** The time of a draft, as the person reads it. */
  protected draftWhen(at: number): string {
    return new Date(at).toLocaleString(this.language === 'en' ? 'en' : 'es', { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected discard(): void {
    if (this.store()?.dirty() && confirm(this.texts.editing.discardAsk)) {
      this.store()!.discard();
      clearDraft(this.id());
      this.refusedPieces.set({});
      this.refusedDesign.set('');
      this.saveProblem.set('');
    }
  }

  private readonly query = toSignal(this.route.queryParamMap);
  /** The guided flow this piece was opened from (`?flow=<id>`), with the step the person is on; `null` when it was opened on its own. */
  protected readonly flowId = computed(() => this.query()?.get('flow') || null);
  protected readonly flowStep = computed<'design' | 'script'>(() => (this.query()?.get('step') === 'design' ? 'design' : 'script'));

  /** Continue on the Flow bar: what is unsaved is saved first, and the flow goes on from where it was (it reads `?continue=` when it opens). A save that fails keeps the person here. */
  protected async continueFlow(): Promise<void> {
    const id = this.flowId();
    if (!id) return;
    if (this.dirty()) await this.save();
    if (this.dirty() || this.hasVectorChanges()) return;
    await this.router.navigate([`${this.base}/flow`, id], { queryParams: { continue: this.flowStep() } });
  }

  /** Saves the design, then the script, one call each and only what changed. A refusal is shown where it belongs and nothing is lost. */
  protected async save(): Promise<void> {
    const store = this.store();
    const piece = this.piece();
    if (!store || !piece || !store.dirty() || this.saving() || this.locked() || this.animateBlocked() || this.layersBlocked()) return;
    // The document is the last script the code mapped to: sending it is the person's call while the code has errors.
    if (this.pausedByCode() && !confirm(this.texts.code.saveWithErrors)) return;
    const start = store.doc();
    const saved = store.saved();
    this.saving.set(true);
    this.justSaved.set(false);
    this.refusedPieces.set({});
    this.refusedDesign.set('');
    this.saveProblem.set('');
    let latest: PieceDetail = piece;
    let stage: 'design' | 'script' = 'design';
    try {
      if (JSON.stringify(start.design) !== JSON.stringify(saved.design)) latest = await firstValueFrom(this.port.saveDesign(piece.id, start.design));
      stage = 'script';
      if (JSON.stringify(start.script) !== JSON.stringify(saved.script)) latest = await firstValueFrom(this.port.saveScript(piece.id, start.script));
      this.piece.set(latest);
      const server: Doc = { design: latest.design.design, script: latest.script };
      if (store.doc() === start) store.settle(server);
      else store.replaceSaved(server);
      this.justSaved.set(true);
      setTimeout(() => this.justSaved.set(false), 3000);
    } catch (e) {
      const reason = e instanceof AnimationFailure ? e.reason : e instanceof Error ? e.message : this.texts.unknownError;
      const id = stage === 'script' ? pieceOf(reason) : null;
      if (stage === 'design') this.refusedDesign.set(reason);
      else if (id) this.refusedPieces.set({ [id]: reason });
      else this.saveProblem.set(reason);
      if (id) this.selection.set({ piece: id });
    } finally {
      this.saving.set(false);
    }
  }

  private say(text: string): void {
    this.notice.set(text);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 4000);
  }

  /** The index of the piece that holds a song time (the last one at the very end). */
  private indexAt(script: Script, t: number): number {
    const i = script.pieces.findIndex((p) => t >= p.start - 1e-9 && t < p.end - 1e-9);
    return i >= 0 ? i : script.pieces.length - 1;
  }

  /** Something from the library was dropped on the timeline: a part on the main track replaces the piece's part, on an extra lane it is added; a text is added at that time. */
  protected onPaletteDrop(drop: { item: PaletteItem; time: number; lane: DropLane }): void {
    const doc = this.doc();
    if (!doc || this.frozen()) return;
    if (typeof drop.lane === 'object' || drop.lane === 'new-layer') {
      this.dropOnLayer(drop.item, drop.time, drop.lane);
      return;
    }
    const i = this.indexAt(doc.script, drop.time);
    if (i < 0) return;
    if (drop.item.kind === 'text') this.addText(i, drop.time);
    else if (drop.lane === 'main') this.putPart(i, drop.item.name);
    else this.addExtraPart(i, drop.item.name);
  }

  /**
   * The keys of the chosen item of a layer: the arrows move it by a tenth of a second (a second with Shift), Alt and the arrows change where it ends,
   * and Ctrl or Cmd with D copies it right after. What the server would refuse is said, never done. Answers whether the key was taken.
   */
  private itemKey(event: KeyboardEvent, key: string, mod: boolean): boolean {
    const sel = this.itemSelection();
    const doc = this.doc();
    const catalog = this.catalog();
    const found = sel && doc ? layerOf(doc.script, sel.layer)?.items[sel.item] : undefined;
    if (!sel || !doc || !catalog || !found) return false;
    const refuse = (script: Script, free: Script): void => {
      const why = free !== script ? layerEditProblem(script, free, catalog) : null;
      if (why) this.say(why);
    };
    if (mod && key === 'd') {
      event.preventDefault();
      if (this.frozen()) return true;
      const next = duplicateItem(doc.script, sel.layer, sel.item, catalog);
      if (next === doc.script) {
        const free = duplicateItem(doc.script, sel.layer, sel.item);
        this.say((free !== doc.script ? layerEditProblem(doc.script, free, catalog) : null) ?? this.texts.editing.noRoom);
        return true;
      }
      this.onEdit({ fn: (d) => ({ ...d, script: duplicateItem(d.script, sel.layer, sel.item, catalog) }) });
      this.itemSelection.set({ layer: sel.layer, item: sel.item + 1 });
      return true;
    }
    if (!mod && (key === 'arrowleft' || key === 'arrowright')) {
      event.preventDefault();
      if (this.frozen()) return true;
      const step = (event.shiftKey ? 1 : 0.1) * (key === 'arrowleft' ? -1 : 1);
      const apply = (s: Script, c?: Catalog): Script => (event.altKey ? resizeItem(s, sel.layer, sel.item, 'end', found.end + step, c) : moveItem(s, sel.layer, sel.item, found.start + step, c));
      const next = apply(doc.script, catalog);
      if (next === doc.script) refuse(doc.script, apply(doc.script));
      else this.onEdit({ fn: (d) => ({ ...d, script: apply(d.script, catalog) }), label: `item-keys-${sel.layer}-${sel.item}` });
      return true;
    }
    return false;
  }

  /** A part dropped on a layer lane adds an item there; on the space under the lanes, a new layer with it. What the server would refuse is said, never done. */
  private dropOnLayer(item: PaletteItem, time: number, lane: DropLane): void {
    const doc = this.doc();
    const catalog = this.catalog();
    if (!doc || !catalog) return;
    if (item.kind === 'text') {
      this.say(this.texts.editing.textNotInLayer);
      return;
    }
    if (!hasLayersFeature(catalog)) {
      this.say(this.texts.editing.layersNotTaken);
      return;
    }
    const existing = typeof lane === 'object' ? doc.script.layers?.[lane.layer] : undefined;
    if (typeof lane === 'object' && !existing) return;
    const range = newItemRange(doc.script, existing?.id ?? null, time);
    if (!range) {
      this.say(this.texts.editing.noRoom);
      return;
    }
    const made = { part: item.name, ...range };
    const next = existing ? addItem(doc.script, existing.id, made, catalog) : addLayerWithItem(doc.script, made, catalog);
    if (next === doc.script) {
      const free = existing ? addItem(doc.script, existing.id, made) : addLayerWithItem(doc.script, made);
      this.say((free !== doc.script ? layerEditProblem(doc.script, free, catalog) : null) ?? this.texts.editing.noRoom);
      return;
    }
    this.onEdit({ fn: (d) => ({ ...d, script: existing ? addItem(d.script, existing.id, made, catalog) : addLayerWithItem(d.script, made, catalog) }) });
    const id = existing?.id ?? next.layers![next.layers!.length - 1].id;
    this.selection.set(null);
    this.itemSelection.set({ layer: id, item: layerOf(next, id)!.items.findIndex((it) => it.start === made.start) });
  }

  /** The + of the library: a text goes where the playhead is, a part becomes an extra of the selected piece (or of the one under the playhead), or its own part when the piece is an empty slot. */
  protected onPaletteAdd(item: PaletteItem): void {
    const doc = this.doc();
    if (!doc || this.frozen()) return;
    const selected = this.selection()?.piece;
    const chosen = selected ? doc.script.pieces.findIndex((p) => p.id === selected) : -1;
    const i = chosen >= 0 ? chosen : this.indexAt(doc.script, this.clock.time());
    if (i < 0) return;
    if (item.kind === 'text') this.addText(i, Math.min(Math.max(this.clock.time(), doc.script.pieces[i].start), doc.script.pieces[i].end));
    // An empty slot is waiting for its part: what is added becomes the piece's own part, not an extra.
    else if (isEmptyPiece(doc.script.pieces[i])) this.putPart(i, item.name);
    else this.addExtraPart(i, item.name);
  }

  /** The replace button of the library: the part becomes the part of the chosen piece (or of the one under the playhead), as a drop on the main track does. */
  protected onPaletteReplace(item: PaletteItem): void {
    const doc = this.doc();
    if (!doc || this.frozen() || item.kind !== 'part') return;
    const selected = this.selection()?.piece;
    const chosen = selected ? doc.script.pieces.findIndex((p) => p.id === selected) : -1;
    const i = chosen >= 0 ? chosen : this.indexAt(doc.script, this.clock.time());
    if (i >= 0) this.putPart(i, item.name);
  }

  /** The layer button of the library: the part becomes an item where the playhead is, in the layer of the chosen item, or in a new layer. */
  protected onPaletteAddLayer(item: PaletteItem): void {
    const doc = this.doc();
    if (!doc || this.frozen()) return;
    const chosen = this.itemSelection();
    const index = chosen ? (doc.script.layers ?? []).findIndex((l) => l.id === chosen.layer) : -1;
    this.dropOnLayer(item, this.clock.time(), index >= 0 ? { layer: index } : 'new-layer');
  }

  private addText(i: number, t: number): void {
    const doc = this.doc()!;
    const piece = doc.script.pieces[i];
    const length = Math.min(3, piece.end - piece.start);
    const start = Math.max(piece.start, Math.min(t, piece.end - Math.min(length, 1.5)));
    const end = Math.min(piece.end, start + length);
    const song = this.piece()!.songMap;
    this.onEdit({ fn: (d) => ({ ...d, script: addLine(d.script, i, { text: this.texts.editing.newText, start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 }, song) }) });
    this.selection.set({ piece: piece.id });
  }

  private putPart(i: number, name: string): void {
    const doc = this.doc()!;
    const catalog = this.catalog()!;
    const piece = doc.script.pieces[i];
    if ((piece.with ?? []).some((w) => w.part === name)) {
      this.say(this.texts.editing.alreadyHas(name));
      return;
    }
    this.onEdit({ fn: (d) => ({ ...d, script: setPart(d.script, i, name, catalog) }) });
    this.selection.set({ piece: piece.id });
  }

  private addExtraPart(i: number, name: string): void {
    const doc = this.doc()!;
    const catalog = this.catalog()!;
    const piece = doc.script.pieces[i];
    const next = addExtra(doc.script, i, name, catalog);
    if (next === doc.script) {
      this.say((piece.with ?? []).length >= 3 ? this.texts.editing.extrasFull : this.texts.editing.alreadyHas(name));
      return;
    }
    this.onEdit({ fn: (d) => ({ ...d, script: addExtra(d.script, i, name, catalog) }) });
    this.selection.set({ piece: piece.id, extra: (piece.with ?? []).length });
  }

  /** Splits the piece under the playhead in two. */
  protected split(): void {
    const doc = this.doc();
    if (!doc || this.frozen()) return;
    const t = this.clock.time();
    const i = this.indexAt(doc.script, t);
    if (i < 0) return;
    const id = newPieceId(doc.script);
    const song = this.piece()!.songMap;
    const catalog = this.catalog() ?? undefined;
    const next = splitPiece(doc.script, i, t, id, song, catalog);
    if (next === doc.script) {
      this.say(this.texts.editing.tooShort);
      return;
    }
    this.onEdit({ fn: (d) => ({ ...d, script: splitPiece(d.script, i, t, id, song, catalog) }) });
    this.selection.set({ piece: id });
  }

  /** Removes the selected piece (or the selected extra part), or the selected item (or its keyframe). */
  protected removeSelected(): void {
    const doc = this.doc();
    const item = this.itemSelection();
    if (doc && item && !this.frozen()) {
      if (item.param !== undefined && item.keyframe !== undefined) {
        this.onEdit({ fn: (d) => ({ ...d, script: removeItemKeyframe(d.script, item.layer, item.item, item.param!, item.keyframe!) }) });
        this.itemSelection.set({ layer: item.layer, item: item.item });
      } else {
        this.onEdit({ fn: (d) => ({ ...d, script: removeItem(d.script, item.layer, item.item) }) });
        this.itemSelection.set(null);
      }
      return;
    }
    const sel = this.selection();
    if (!doc || !sel || this.frozen()) {
      if (!sel) this.say(this.texts.editing.nothingSelected);
      return;
    }
    const i = doc.script.pieces.findIndex((p) => p.id === sel.piece);
    if (i < 0) return;
    if (sel.param !== undefined && sel.keyframe !== undefined) {
      // A keyframe: it goes, and the part it belonged to stays selected.
      this.onEdit({ fn: (d) => ({ ...d, script: removeKeyframe(d.script, i, sel.param!, sel.keyframe!, sel.extra) }) });
      this.selection.set(sel.extra !== undefined ? { piece: sel.piece, extra: sel.extra } : { piece: sel.piece });
      return;
    }
    if (sel.line !== undefined) {
      const map = this.piece()!.songMap;
      this.onEdit({ fn: (d) => ({ ...d, script: removeLine(d.script, i, sel.line!, map) }) });
      this.selection.set({ piece: sel.piece });
      return;
    }
    if (sel.extra !== undefined) {
      this.onEdit({ fn: (d) => ({ ...d, script: removeExtra(d.script, i, sel.extra!) }) });
      this.selection.set({ piece: sel.piece });
      return;
    }
    // A piece is emptied, not taken out: the slot stays, blank, to be filled with whatever the person wants. Removing the slot closes the gap.
    const catalog = this.catalog();
    if (catalog && !isEmptyPiece(doc.script.pieces[i]) && emptyPiece(doc.script, i, catalog) !== doc.script) {
      this.onEdit({ fn: (d) => ({ ...d, script: emptyPiece(d.script, i, catalog) }) });
      return;
    }
    if (removePiece(doc.script, i) === doc.script) {
      this.say(this.texts.editing.lastPiece);
      return;
    }
    this.onEdit({ fn: (d) => ({ ...d, script: removePiece(d.script, i) }) });
    this.selection.set(null);
  }

  /** The remove button of a row of the pieces list. */
  protected onRemovePiece(id: string): void {
    this.selection.set({ piece: id });
    this.removeSelected();
  }

  /** A row of the layers was pressed: select it and take the playhead to where that piece starts (the timeline goes there too). */
  protected onLayerSelect(selection: Selection | null): void {
    this.selection.set(selection);
    const piece = selection ? this.doc()?.script.pieces.find((p) => p.id === selection.piece) : undefined;
    if (piece) this.clock.seek(piece.start);
  }

  /** A part was approved: the catalog is read again so the library, the inspector and the checks know it, and the person is told. */
  protected onPartApproved(name: string): void {
    this.port
      .catalog()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (catalog) => {
          this.catalog.set(catalog);
          this.sideTab.set('library');
          this.say(this.texts.newPart.approved(name));
        },
        error: () => this.say(this.texts.newPart.approved(name)),
      });
  }

  /** The timeline stopped an item where the server's rules say it must stop: the reason is said while the drag lasts. */
  protected onItemRefused(reason: string): void {
    if (reason) this.say(reason);
  }

  protected pickItem(item: ItemSelection | null): void {
    this.itemSelection.set(item);
    if (item) this.selection.set(null);
  }

  protected onSeek(t: number): void {
    this.clock.seek(t);
  }

  /** Shows the visual editor, the code or the vector part. The code is written from the document the first time and whenever it was left behind. */
  protected async setView(view: 'visual' | 'code' | 'vector'): Promise<void> {
    if (view === this.view()) return;
    // Code and Vector take the same place: leaving the Vector tab for Code with changes pending asks first (the Visual view keeps them).
    if (this.view() === 'vector' && view === 'code' && this.vector.dirty() && (await this.askVector()) === 'stay') return;
    if (view === 'vector' && !(await this.openVector())) return;
    this.view.set(view);
    if (view !== 'code') return;
    this.codeOpened.set(true);
    untracked(() => {
      this.sync.reconcile();
      this.tellReplaced();
    });
  }

  // — the Vector tab —

  /** Reads the part of the chosen block to know whether it carries a vector model. */
  private probeVector(part: string | null): void {
    this.probeRun?.unsubscribe();
    if (!part) {
      this.probe.set(null);
      return;
    }
    this.probe.set({ part, state: 'loading' });
    this.probeRun = this.fragments.fragment(part).subscribe((text) => {
      const read = text ? documentOfPart(text) : null;
      this.probe.set(read && 'doc' in read ? { part, state: 'vector', doc: read.doc } : { part, state: 'not' });
    });
  }

  /** Asks Save, Discard or Stay about the vector part's unsaved changes. Discard throws them away; Save opens the save window and goes on once it saved. */
  protected askVector(): Promise<LeaveAnswer> {
    if (!this.vector.dirty()) return Promise.resolve('discard');
    const name = this.vector.partName();
    return new Promise((resolve) => {
      this.vectorAsk.set({
        what: name ? this.texts.vector.editing(name) : this.texts.vector.creating,
        done: (answer) => {
          this.vectorAsk.set(null);
          if (answer === 'discard') this.vector.discard();
          if (answer === 'save') {
            // The save window is the person's to finish: what asked goes on after it saved, and stays put if the window is closed without it.
            this.afterVectorSave = () => resolve('save');
            this.stayAfterClose = () => resolve('stay');
            this.view.set('vector');
            queueMicrotask(() => this.vectorTab()?.openSend(false));
            return;
          }
          resolve(answer);
        },
      });
    });
  }

  protected answerVector(answer: LeaveAnswer): void {
    this.vectorAsk()?.done(answer);
  }

  /** The save window closed without saving: what was waiting for it stays where it was. */
  protected vectorClosed(): void {
    const stay = this.stayAfterClose;
    this.afterVectorSave = null;
    this.stayAfterClose = null;
    stay?.();
  }

  /**
   * Opens the chosen part in the Vector tab. With another vector part already open and changed it asks first. Returns whether the tab can be shown.
   */
  private async openVector(): Promise<boolean> {
    const probe = this.probe();
    const block = this.block();
    const open = this.vector.open();
    if (probe?.state === 'vector' && probe.doc && block && (!open || this.vector.partName() !== probe.part)) {
      if (open && this.vector.dirty() && (await this.askVector()) === 'stay') return false;
      this.vector.openPart(probe.doc);
      this.vectorBlock.set(block);
    }
    return this.vector.open();
  }

  /** Part saved from the tab: the part is read again, the library and the checks know it, and the preview of the scenes that draw it is rebuilt. */
  protected onVectorSaved(saved: VectorSaved): void {
    this.fragments.forget(saved.name);
    this.probe.update((p) => (p?.part === saved.name ? { part: saved.name, state: 'loading' } : p));
    if (this.block()?.part === saved.name) this.probeVector(saved.name);
    if (saved.replaced) {
      this.port
        .catalog()
        .pipe(takeUntilDestroyed(this.destroyed))
        .subscribe({ next: (catalog) => this.catalog.set(catalog), error: () => undefined });
      this.rebuildScenesUsing(saved.name);
      this.say(this.texts.vector.saved(saved.name));
    } else this.onPartApproved(saved.name);
    const after = this.afterVectorSave;
    this.afterVectorSave = null;
    this.stayAfterClose = null;
    after?.();
  }

  /** Builds the pages again, only of the scenes that draw the part (its text was read again: the page source keys a page by what it was built from). */
  private rebuildScenesUsing(name: string): void {
    const piece = this.piece();
    const catalog = this.catalog();
    const doc = this.doc();
    if (!piece || !catalog || !doc) return;
    const only = scenesUsing(doc.script, name);
    if (only.length === 0) return;
    this.source.pages({ piece, design: doc.design, script: doc.script, catalog, hidden: this.hidden() }, only).pipe(takeUntilDestroyed(this.destroyed)).subscribe((fresh) => {
      const byId = new Map(fresh.map((p) => [p.id, p] as const));
      this.pages.update((current) => current.map((p) => byId.get(p.id) ?? p));
      this.previewProblem.set(this.remote?.lastProblem ?? null);
    });
  }

  /** New vector part…: a file is chosen, and the Vector tab opens on a new document made from it. */
  protected async vectorFileChosen(file: File): Promise<void> {
    if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') return this.say(this.texts.vector.notSvg(file.name));
    const made = documentOfSvg(file.name, await file.text());
    if ('problem' in made) return this.say(this.texts.vector.cannotOpen(made.problem));
    if (this.vector.open() && this.vector.dirty() && (await this.askVector()) === 'stay') return;
    this.vector.openNew(made.doc);
    this.vectorBlock.set(this.block() ?? this.firstBlock());
    await this.setView('vector');
  }

  /** The first piece of the script, for the beats of a new vector part when nothing is chosen. */
  private firstBlock(): Block | null {
    const p = this.doc()?.script.pieces[0];
    return p ? { part: p.part, start: p.start, end: p.end } : null;
  }

  /** The first time the code is written over something the person wrote, they are told. */
  private tellReplaced(): void {
    if (this.sync.takeReplaced()) this.say(this.texts.code.replaced);
  }

  /** The cursor moved in the code: the block of the piece it is in (or of its extra part) is selected. A piece that is not in the document yet selects nothing. */
  protected onCodeCursor(offset: number): void {
    const doc = this.doc();
    if (!doc) return;
    const site = this.sync.sites().find((x) => offset >= x.range.start.offset && offset <= x.range.end.offset);
    let next: Selection | null = null;
    if (site && doc.script.pieces.some((p) => p.id === site.id)) {
      const extra = site.extras.findIndex((r) => offset >= r.start.offset && offset <= r.end.offset);
      next = extra >= 0 ? { piece: site.id, extra } : { piece: site.id };
    }
    const current = this.selection();
    if (!sameSelection(current, next)) this.selection.set(next);
  }

  /** A note of the review was chosen: its block is selected. */
  protected onReviewSelect(scriptPiece: string): void {
    if (this.doc()?.script.pieces.some((p) => p.id === scriptPiece)) this.selection.set({ piece: scriptPiece });
  }

  /** Scene… on a block: the dialog opens to write its scene. */
  protected writeScene(scriptPiece: string): void {
    if (this.frozen()) return;
    this.sceneDraft.set(null);
    this.sceneEditing.set(null);
    this.sceneTarget.set({ scriptPiece, label: scriptPiece });
    this.sceneOpen.set(true);
  }

  /** Edit scene… on a block whose part is a scene: its texts. */
  protected editScene(request: { readonly piece: string; readonly part: string }): void {
    this.sceneDraft.set(null);
    this.sceneEditing.set(request.part);
    this.sceneTarget.set({ scriptPiece: request.piece, label: request.piece });
    this.sceneOpen.set(true);
  }

  /** A card of the batch was opened: its draft is shown in the dialog. */
  protected openCard(entry: SceneBatchDraft): void {
    if (!entry.draftId) return;
    this.sceneEditing.set(null);
    this.sceneDraft.set(entry.draftId);
    this.sceneTarget.set({ scriptPiece: entry.scriptPiece, label: entry.scriptPiece });
    this.sceneOpen.set(true);
  }

  /**
   * A scene was approved from its draft: the catalog is read again (the part is new) and the block takes it as its part, through the store, so it can be undone and is saved with the
   * script. Nothing is sent to the script on the server.
   */
  protected onSceneApproved(approved: SceneApproved): void {
    this.port
      .catalog(this.id())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (catalog) => {
          this.catalog.set(catalog);
          const doc = this.doc();
          const i = doc ? doc.script.pieces.findIndex((p) => p.id === approved.scriptPiece) : -1;
          if (i < 0) return this.say(this.texts.editing.noRoom);
          this.onEdit({ fn: (d) => ({ ...d, script: setPart(d.script, i, approved.part, catalog) }) });
          this.selection.set({ piece: approved.scriptPiece });
        },
        error: () => this.say(this.texts.newPart.approved(approved.part)),
      });
  }

  /** The texts of a scene were saved: the part is read again, the library knows it and the pages that draw it are built again. */
  protected onSceneEdited(name: string): void {
    this.fragments.forget(name);
    this.port
      .catalog(this.id())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (catalog) => this.catalog.set(catalog), error: () => undefined });
    this.rebuildScenesUsing(name);
  }

  /** The server approved the batch and saved the script: the piece and the catalog are read again. */
  protected onScenesApproved(approval: SceneApproval): void {
    this.port
      .catalog(this.id())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (catalog) => this.catalog.set(catalog), error: () => undefined });
    this.reload();
    if (approval.approved.length) this.selection.set({ piece: approval.approved[0].scriptPiece });
  }

  /** Before the server approves the batch the editor must hold nothing unsaved: Save sends it, Discard throws it away. Answers whether it is clean now. */
  protected readonly prepareApproval: PrepareApproval = async (mode) => {
    const store = this.store();
    if (!store) return false;
    if (mode === 'save') await this.save();
    else {
      store.discard();
      clearDraft(this.id());
      this.refusedPieces.set({});
      this.refusedDesign.set('');
      this.saveProblem.set('');
    }
    return !store.dirty();
  };

  /** Takes every keyframe off the script, which is what a server that does not take them needs. */
  protected removeAllKeyframes(): void {
    this.onEdit({ fn: (d) => ({ ...d, script: clearAnimate(d.script) }) });
  }

  /** Takes every layer off the script, which is what a server that does not take them needs. */
  protected removeAllLayers(): void {
    this.onEdit({ fn: (d) => ({ ...d, script: clearLayers(d.script) }) });
    this.itemSelection.set(null);
  }

  /** The code is thrown away and written again from the document. */
  protected revertCode(): void {
    if (confirm(this.texts.code.revertAsk)) this.sync.revert();
  }
}
