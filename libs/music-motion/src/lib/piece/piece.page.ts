import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';

import { injectLink } from '../core/links';
import { AnimationFailure, isBusy, isProposing, type Catalog, type Piece, type PieceDetail } from '@lab/animation-core';
import { LocalStyles } from '../animation/local-styles';
import { ANIMATION } from '../animation/tokens';
import { MUSIC_MOTION_LINKS } from '../core/external-links';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { ExportDataset } from '../shared/export-dataset/export-dataset';
import { failureText } from '../shared/failure-text';
import { Notifier } from '../shared/notifier';
import { DesignForm } from './design-form/design-form';
import { ProposalStrip } from './proposal-strip/proposal-strip';
import { ProposePanel } from './propose/propose-panel';
import { RenderPanel } from './render-panel/render-panel';
import { ScriptEditor } from './script-editor/script-editor';
import { SongMapView } from './song-map/song-map';

type Tab = 'render' | 'propose';

/** One piece, whole: its design and script to edit, its song map, the forecast and the render. */
@Component({
  selector: 'app-piece-page',
  imports: [DesignForm, ExportDataset, ProposalStrip, ProposePanel, RenderPanel, ScriptEditor, SongMapView, RouterLink],
  templateUrl: './piece.page.html',
  styleUrl: './piece.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PiecePage implements OnInit {
  protected readonly link = injectLink();
  private readonly places = inject(MUSIC_MOTION_LINKS);
  /** Where the host edits a piece, when it said (the link to it is drawn only then). */
  protected editor(id: string): string | undefined {
    return this.places.pieceEditor?.(id);
  }
  private readonly port = inject(ANIMATION);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly destroyed = inject(DestroyRef);
  private readonly notifier = inject(Notifier);
  private following?: Subscription;
  private followingProposal?: Subscription;
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.piece;
  protected readonly common = this.texts;
  protected readonly states = this.texts.pieces.states;

  /** `undefined` while it loads, `null` when it does not exist (or could not be read: `error` says). */
  protected readonly piece = signal<PieceDetail | null | undefined>(undefined);
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly error = signal('');
  /** The style the piece started from: its name, `null` when it has been deleted, `undefined` when it is not known. */
  protected readonly presetName = signal<string | null | undefined>(undefined);
  private readonly local = inject(LocalStyles);
  /** The own style kept in this browser that the piece started from, when it did. */
  protected readonly ownStyle = computed(() => (this.piece() ? this.local.startedFrom(this.piece()!.id) : undefined));
  /** Why the words were not heard when the piece was made with that option: it came with the navigation, the server does not keep it. */
  protected readonly notice = signal<string>((history.state as { notice?: string } | null)?.notice ?? '');
  /** Who wrote the script of a piece made from a prompt, or why the text could not be applied: said once, by the page that made the piece. */
  protected readonly promptNote = signal<{ kind: 'assistant' | 'fallback' | 'failed'; reason?: string } | null>((history.state as { promptNote?: { kind: 'assistant' | 'fallback' | 'failed'; reason?: string } } | null)?.promptNote ?? null);
  /** The span of the script piece being looked at, marked on the song map. */
  protected readonly span = signal<{ start: number; end: number } | null>(null);
  protected readonly tabs: readonly { id: Tab }[] = [{ id: 'render' }, { id: 'propose' }];
  protected readonly tabLabels = computed((): Record<Tab, string> => ({ render: this.texts.render.title, propose: this.texts.propose.title }));
  protected readonly current = signal<Tab>('render');
  protected readonly busy = computed(() => {
    const p = this.piece();
    return p ? isBusy(p) : false;
  });

  ngOnInit(): void {
    forkJoin({ piece: this.port.piece(this.id), catalog: this.port.catalog() })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: ({ piece, catalog }) => {
          this.catalog.set(catalog);
          this.piece.set(piece);
          if (piece.preset) this.readPreset(piece.preset);
          // A piece that is already being drawn (the page was opened, or reloaded, meanwhile) is followed from the start.
          if (isBusy(piece)) this.follow();
          // So is a proposal that is being written (it was asked from here, or from New animation, or the page was reloaded meanwhile).
          if (isProposing(piece)) this.followProposal();
        },
        error: (e) => {
          this.error.set(e instanceof AnimationFailure && e.kind === 'missing' ? '' : failureText(e, this.texts));
          this.piece.set(null);
        },
      });
  }

  /**
   * Follows the drawing: each change of state and progress is put on the page as it comes, and when it ends the piece is
   * read again whole (its video, its size) and the person is told if they are not looking at the page.
   */
  protected follow(): void {
    this.following?.unsubscribe();
    this.following = this.port
      .follow(this.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (now: Piece) => this.piece.update((p) => (p ? { ...p, ...now } : p)),
        error: (e) => this.error.set(failureText(e, this.texts)),
        complete: () => this.finish(),
      });
  }

  /** The name of the style the piece started from, or that it has been deleted; the origin is not worth failing the page for. */
  private readPreset(id: string): void {
    this.port
      .preset(id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (p) => this.presetName.set(p.name), error: (e) => this.presetName.set(e instanceof AnimationFailure && e.kind === 'missing' ? null : undefined) });
  }

  private finish(): void {
    this.port
      .piece(this.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (piece) => {
          this.piece.set(piece);
          if (piece.state === 'done') this.notifier.finished(this.texts.render.finishedTitle, this.texts.render.finishedBody.replace('{title}', piece.title));
          else if (piece.state === 'failed') this.notifier.finished(this.texts.render.failedTitle, this.texts.render.failedBody.replace('{title}', piece.title));
        },
        // The piece was deleted meanwhile (here or elsewhere): there is nothing to show.
        error: () => this.piece.set(null),
      });
  }

  /** Arrow keys, Home and End move between the tabs. */
  protected moveTab(e: KeyboardEvent): void {
    const ids = this.tabs.map((t) => t.id);
    const i = ids.indexOf(this.current());
    const to = e.key === 'ArrowRight' ? (i + 1) % ids.length : e.key === 'ArrowLeft' ? (i + ids.length - 1) % ids.length : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    this.current.set(ids[to]);
    document.getElementById('tab-' + ids[to])?.focus();
  }

  /** The words were heard: the notice of the creation no longer holds. */
  protected heard(piece: PieceDetail): void {
    this.notice.set('');
    this.piece.set(piece);
  }

  /** What the server holds after a save or a proposal replaced part of the piece. */
  protected replace(piece: PieceDetail): void {
    this.piece.set(piece);
    if (isProposing(piece)) this.followProposal();
  }

  /** Follows the proposal written in the background: each change of it is put on the page as it comes, and the piece it leaves is the one shown. */
  private followProposal(): void {
    this.followingProposal?.unsubscribe();
    this.followingProposal = this.port
      .followProposal(this.id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (piece) => this.piece.set(piece),
        error: (e) => this.error.set(failureText(e, this.texts)),
      });
  }
}
