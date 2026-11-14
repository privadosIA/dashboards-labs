import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import { AnimationFailure, BRIEF_MODES, REVIEW_ATTEMPTS_MAX, type BriefMode, type ReviewAsk, type SceneApproval, type SceneBatch, type SceneBatchDraft } from '@lab/animation-core';
import { AssistantPicker, type Assistant } from '@lab/assist-kit';
import { pickSchema } from '@lab/forms-kit';
import { ANIMATION } from '@lab/music-motion';
import type { Subscription } from 'rxjs';

import { LanguageService } from '../../../core/language';
import { SceneCard } from '../scene-card/scene-card';
import { sceneTextsFor } from '../texts';
import en from './dynamic/batch.en.json';
import es from './dynamic/batch.es.json';

/** What to do about unsaved changes before the server approves the batch: save them, throw them away. Answers whether the editor is clean now. */
export type PrepareApproval = (mode: 'save' | 'discard') => Promise<boolean>;

/**
 * Write all scenes, over the timeline: a small form (how the scenes are thought, who writes them, the review), then the progress of the batch the server writes (done of total, the block
 * being written, Stop) and one card per block. Approve all ready makes the server approve and save the script, so it is refused while the editor holds changes that are not saved: the person
 * chooses to save or discard them first. The page reads the piece again when it is approved.
 */
@Component({
  selector: 'app-scenes-strip',
  imports: [AssistantPicker, DynamicFormComponent, SceneCard],
  templateUrl: './scenes-strip.html',
  styleUrl: './scenes-strip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenesStrip {
  /** The piece (its id). */
  readonly piece = input.required<string>();
  /** The last batch the piece's script remembers, or none. */
  readonly initial = input<SceneBatch | null | undefined>(null);
  /** The editor has changes that are not saved. */
  readonly dirty = input(false);
  /** The piece is being drawn or proposed: nothing is started over it. */
  readonly locked = input(false);
  readonly reviewing = input(true);
  /** The page's answer to "save or discard first". */
  readonly prepare = input<PrepareApproval>(() => Promise.resolve(false));
  /** A card was opened: the draft to look at. */
  readonly open = output<SceneBatchDraft>();
  /** The batch was approved on the server: the page reads the piece again. */
  readonly approved = output<SceneApproval>();

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = sceneTextsFor(this.lang).batch;
  private readonly base = pickSchema('motion-edit-scenes-batch', { en, es }, this.lang);

  protected readonly batch = signal<SceneBatch | null>(null);
  protected readonly configuring = signal(false);
  protected readonly value = signal<Record<string, unknown>>({ briefMode: 'metaphor', review: true, reviewMin: 7, reviewAttempts: 2 });
  protected readonly valid = signal(true);
  protected readonly assistant = signal<Assistant>({ provider: '', model: '' });
  protected readonly routingModels = signal<readonly string[]>([]);
  protected readonly starting = signal(false);
  protected readonly stopping = signal(false);
  protected readonly refused = signal('');
  /** Asking what to do with the unsaved changes before Approve all ready. */
  protected readonly askingClean = signal(false);
  protected readonly approving = signal(false);
  protected readonly result = signal<SceneApproval | null>(null);

  protected readonly schema = computed<DfFormSchema>(() => (this.reviewing() ? this.base : { ...this.base, fields: this.base.fields.filter((f) => (f as { key?: string }).key === 'briefMode') }));
  protected readonly writing = computed(() => this.batch()?.state === 'writing');
  protected readonly ready = computed(() => (this.batch()?.drafts ?? []).filter((d) => d.state === 'ready').length);
  /** The script piece being written now: the first draft that is `writing`. */
  protected readonly current = computed(() => this.batch()?.drafts.find((d) => d.state === 'writing')?.scriptPiece ?? '');
  protected readonly cards = computed(() => (this.batch()?.drafts ?? []).filter((d) => d.state !== 'pending' || this.writing()));

  private following?: Subscription;

  constructor() {
    effect(() => {
      const initial = this.initial();
      untracked(() => {
        if (initial && !this.batch()) this.take(initial);
      });
    });
    this.destroyed.onDestroy(() => this.following?.unsubscribe());
  }

  /** Takes a batch as it is and follows it while it is written. */
  private take(batch: SceneBatch): void {
    this.batch.set(batch);
    if (batch.state !== 'writing') return;
    this.following?.unsubscribe();
    this.following = this.port
      .followScenes(this.piece())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (b) => this.batch.set(b), error: (e) => this.refused.set(this.reasonOf(e)) });
  }

  private reasonOf(e: unknown): string {
    return e instanceof AnimationFailure ? e.reason : e instanceof Error ? e.message : String(e);
  }

  protected configure(): void {
    this.configuring.set(true);
    this.port
      .assistModels()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (m) => this.routingModels.set(m.models.map((x) => x.name)), error: () => undefined });
  }

  private reviewAsk(): boolean | ReviewAsk {
    if (!this.reviewing() || this.value()['review'] !== true) return false;
    const min = Number(this.value()['reviewMin']);
    const attempts = Number(this.value()['reviewAttempts']);
    return { ...(min >= 1 && min <= 10 ? { min } : {}), ...(attempts >= 0 && attempts <= REVIEW_ATTEMPTS_MAX ? { attempts } : {}) };
  }

  protected start(): void {
    if (!this.valid() || this.starting() || this.locked()) return;
    const mode = this.value()['briefMode'];
    const briefMode: BriefMode = BRIEF_MODES.includes(mode as BriefMode) ? (mode as BriefMode) : 'metaphor';
    const { provider, model } = this.assistant();
    this.starting.set(true);
    this.refused.set('');
    this.result.set(null);
    this.port
      .writeScenes(this.piece(), { briefMode, ...(model ? { model } : {}), ...(provider ? { provider } : {}), review: this.reviewAsk() })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (b) => {
          this.starting.set(false);
          this.configuring.set(false);
          this.following?.unsubscribe();
          this.batch.set(null);
          this.take(b);
        },
        error: (e) => {
          this.starting.set(false);
          this.refused.set(this.t.failed(this.reasonOf(e)));
        },
      });
  }

  protected stop(): void {
    if (this.stopping()) return;
    this.stopping.set(true);
    this.port
      .cancelScenes(this.piece())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (b) => {
          this.stopping.set(false);
          this.batch.set(b);
        },
        error: (e) => {
          this.stopping.set(false);
          this.refused.set(this.reasonOf(e));
        },
      });
  }

  /** Approve all ready: asked to save or discard first when the editor has changes; otherwise the server approves at once. */
  protected approveAll(): void {
    if (this.approving() || this.ready() === 0) return;
    if (this.dirty()) {
      this.askingClean.set(true);
      return;
    }
    this.send();
  }

  protected async clean(mode: 'save' | 'discard'): Promise<void> {
    this.approving.set(true);
    const ok = await this.prepare()(mode);
    this.approving.set(false);
    if (!ok) {
      this.refused.set(this.t.approveDirtyStays);
      return;
    }
    this.askingClean.set(false);
    this.send();
  }

  private send(): void {
    this.approving.set(true);
    this.refused.set('');
    this.port
      .approveScenes(this.piece())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (approval) => {
          this.approving.set(false);
          this.result.set(approval);
          this.approved.emit(approval);
          this.following?.unsubscribe();
          this.batch.update((b) => (b ? { ...b, drafts: b.drafts.map((d) => (approval.approved.some((a) => a.scriptPiece === d.scriptPiece) ? { ...d, state: 'approved' as const } : d)) } : b));
        },
        error: (e) => {
          this.approving.set(false);
          this.refused.set(this.reasonOf(e));
        },
      });
  }
}
