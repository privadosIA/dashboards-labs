import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, model, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import { AnimationFailure, REVIEW_ATTEMPTS_MAX, SCENE_BRIEF_MAX, type ReviewAsk } from '@lab/animation-core';
import { AssistantPicker, type Assistant } from '@lab/assist-kit';
import { pickSchema } from '@lab/forms-kit';
import { ANIMATION } from '@lab/music-motion';

import { LanguageService } from '../../../core/language';
import { DraftView } from '../../new-part/draft-view/draft-view';
import { sceneTextsFor } from '../texts';
import en from './dynamic/scene.en.json';
import es from './dynamic/scene.es.json';

/** The block a scene is written for: the piece it is in the script of and the script piece, with the idea the block had, if any. */
export interface SceneTarget {
  readonly scriptPiece: string;
  readonly label: string;
  readonly brief?: string;
}

/** A scene that the person approved: the script piece that takes it as its part, and the part's name. Nothing is on the server's script yet. */
export interface SceneApproved {
  readonly scriptPiece: string;
  readonly part: string;
}

/**
 * Writes the scene of one block: the idea, who writes it and (with the `review` feature) how it is checked; then the draft view, where the pictures, the review and the texts are
 * seen before Approve. Approving does not touch the script: the page puts the part in the block through the store, so it can be undone and is saved with Ctrl+S.
 */
@Component({
  selector: 'app-scene-dialog',
  imports: [AssistantPicker, DraftView, DynamicFormComponent],
  templateUrl: './scene-dialog.html',
  styleUrl: './scene-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SceneDialog {
  readonly open = model(false);
  /** The piece (its id) the scene belongs to. */
  readonly piece = input.required<string>();
  readonly target = input<SceneTarget | null>(null);
  /** Whether the server reviews drafts: without it no review settings are asked for. */
  readonly reviewing = input(true);
  /** A draft already written (opened from a scene card): it is shown at once. */
  readonly draftId = input<string | null>(null);
  /** The name of a scene part to change by its texts (Edit scene), instead of writing a new one. */
  readonly editPart = input<string | null>(null);
  readonly approved = output<SceneApproved>();
  /** The texts of a scene part were saved on the server: its name. */
  readonly edited = output<string>();

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = sceneTextsFor(this.lang).dialog;
  private readonly base = pickSchema('motion-edit-scene', { en, es }, this.lang);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly schema = computed<DfFormSchema>(() => (this.reviewing() ? this.base : { ...this.base, fields: this.base.fields.filter((f) => (f as { key?: string }).key === 'brief') }));
  protected readonly value = signal<Record<string, unknown>>({});
  protected readonly valid = signal(true);
  protected readonly assistant = signal<Assistant>({ provider: '', model: '' });
  protected readonly routingModels = signal<readonly string[]>([]);
  protected readonly asking = signal(false);
  protected readonly refused = signal('');
  /** The draft on view; none while the person describes the scene. */
  protected readonly current = signal<string | null>(null);
  protected readonly manifest = signal('');
  protected readonly fragment = signal('');
  protected readonly reading = signal(false);
  protected readonly saving = signal(false);
  protected readonly savedName = signal<string | null>(null);
  protected readonly problems = signal<readonly string[]>([]);
  /** The part just approved, so that the dialog can say it is in the block. */
  protected readonly done = signal<string | null>(null);

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        el.showModal();
        this.start();
      } else if (!this.open() && el.open) el.close();
    });
  }

  private start(): void {
    this.problems.set([]);
    this.savedName.set(null);
    const name = this.editPart();
    if (name) {
      this.reading.set(true);
      this.port
        .partText(name)
        .pipe(takeUntilDestroyed(this.destroyed))
        .subscribe({
          next: (text) => {
            this.reading.set(false);
            this.manifest.set(text.manifest);
            this.fragment.set(text.fragment);
          },
          error: () => {
            this.reading.set(false);
            this.refused.set(this.t.notEditable);
          },
        });
      return;
    }
    this.refused.set('');
    this.asking.set(false);
    this.done.set(null);
    this.current.set(this.draftId());
    this.value.set({ brief: this.target()?.brief ?? '', review: this.reviewing(), reviewMin: 7, reviewAttempts: 2 });
    this.port
      .assistModels()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({ next: (m) => this.routingModels.set(m.models.map((x) => x.name)), error: () => undefined });
  }

  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.open.set(false);
  }

  protected title(): string {
    return this.editPart() ? this.t.editTitle(this.target()?.label ?? '') : this.t.title(this.target()?.label ?? '');
  }

  protected canAsk(): boolean {
    const brief = String(this.value()['brief'] ?? '');
    return this.valid() && brief.length <= SCENE_BRIEF_MAX && !this.asking() && !!this.target();
  }

  /** What the review is asked to do: nothing, the server's defaults, or a minimum and a number of rewrites. */
  private reviewAsk(): boolean | ReviewAsk {
    if (!this.reviewing() || this.value()['review'] !== true) return false;
    const min = Number(this.value()['reviewMin']);
    const attempts = Number(this.value()['reviewAttempts']);
    return { ...(Number.isFinite(min) && min >= 1 && min <= 10 ? { min } : {}), ...(Number.isFinite(attempts) && attempts >= 0 && attempts <= REVIEW_ATTEMPTS_MAX ? { attempts } : {}) };
  }

  protected ask(): void {
    const target = this.target();
    if (!target || !this.canAsk()) return;
    this.asking.set(true);
    this.refused.set('');
    const brief = String(this.value()['brief'] ?? '').trim();
    const { provider, model } = this.assistant();
    this.port
      .askDraft({
        request: '',
        scene: { piece: this.piece(), scriptPiece: target.scriptPiece, ...(brief ? { brief } : {}) },
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
        review: this.reviewAsk(),
      })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (d) => {
          this.asking.set(false);
          this.current.set(d.id);
        },
        error: (e) => {
          this.asking.set(false);
          this.refused.set(e instanceof AnimationFailure ? e.reason : e instanceof Error ? e.message : String(e));
        },
      });
  }

  /** The draft became a part: the block takes it. */
  protected onApproved(part: string): void {
    const target = this.target();
    if (!target) return;
    this.done.set(part);
    this.current.set(null);
    this.approved.emit({ scriptPiece: target.scriptPiece, part });
  }

  protected typeManifest(event: Event): void {
    this.manifest.set((event.target as HTMLTextAreaElement).value);
    this.savedName.set(null);
  }

  protected typeFragment(event: Event): void {
    this.fragment.set((event.target as HTMLTextAreaElement).value);
    this.savedName.set(null);
  }

  /** Edit scene: both texts go whole to the server, which checks them like an approval; a refusal lists the problems and changes nothing. */
  protected save(): void {
    const name = this.editPart();
    if (!name || this.saving() || this.reading()) return;
    this.saving.set(true);
    this.problems.set([]);
    this.savedName.set(null);
    this.port
      .replacePart(name, { manifest: this.manifest(), fragment: this.fragment() })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.savedName.set(name);
          this.edited.emit(name);
        },
        error: (e) => {
          this.saving.set(false);
          const reason = e instanceof AnimationFailure ? e.reason : e instanceof Error ? e.message : String(e);
          this.problems.set(reason.split('\n').filter((l) => l.trim() !== ''));
        },
      });
  }

  /** Ask again: back to the idea, which is kept, so that it can be changed. */
  protected again(): void {
    this.current.set(null);
  }
}
