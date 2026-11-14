import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import { AnimationFailure, isWriting, verdictOf, type Draft } from '@lab/animation-core';
import { ANIMATION } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { sceneTextsFor } from '../../scenes/texts';
import { PART_TEMPLATE } from '../template';

/**
 * One draft of a part: followed while it is written, then its preview pictures, its manifest and its fragment (edited and sent whole to the server, which
 * checks them), Retry for a failed one, and Approve or Delete. What the server says is shown in its own words and a refusal changes nothing.
 */
@Component({
  selector: 'app-draft-view',
  templateUrl: './draft-view.html',
  styleUrl: './draft-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftView {
  readonly id = input.required<string>();
  /** Milliseconds between two reads of a draft that is being written. */
  readonly pollMs = input(1500);
  /** The draft was approved: the name of the part now in the catalog. */
  readonly approved = output<string>();
  /** The draft is gone (deleted), or the person asked for another part. */
  readonly closed = output<void>();
  /** Something about the draft changed, so the list of drafts is read again. */
  readonly changed = output<void>();

  private readonly port = inject(ANIMATION);
  private readonly tickets = inject(TicketService);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).newPart;
  protected readonly ts = sceneTextsFor(this.lang).draft;

  protected readonly draft = signal<Draft | null>(null);
  protected readonly manifest = signal('');
  protected readonly fragment = signal('');
  protected readonly dirty = signal(false);
  protected readonly problems = signal<readonly string[]>([]);
  protected readonly saved = signal(false);
  protected readonly saving = signal(false);
  protected readonly approving = signal(false);
  protected readonly removing = signal(false);
  protected readonly refused = signal('');

  protected readonly writing = computed(() => !!this.draft() && isWriting(this.draft()!));
  protected readonly canApprove = computed(() => this.draft()?.state === 'ready' && !this.dirty() && !this.approving());
  protected readonly name = computed(() => {
    try {
      return (JSON.parse(this.manifest()) as { name?: string }).name ?? '';
    } catch {
      return this.draft()?.name ?? '';
    }
  });

  /** The verdict of the draft's review: the server's, or the one its score has. */
  protected readonly verdict = computed(() => {
    const r = this.draft()?.review;
    return r?.verdict ?? (r?.score !== undefined ? verdictOf(r.score) : null);
  });

  private following?: Subscription;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
    this.destroyed.onDestroy(() => this.following?.unsubscribe());
  }

  /** Reads the draft and, while it is being written, again every `pollMs`; the texts are taken from the server whenever the person has no edit of their own. */
  private load(id: string): void {
    this.following?.unsubscribe();
    this.draft.set(null);
    this.dirty.set(false);
    this.problems.set([]);
    this.saved.set(false);
    this.refused.set('');
    this.following = timer(0, this.pollMs())
      .pipe(
        switchMap(() => this.port.draft(id)),
        takeWhile((d) => isWriting(d), true),
        takeUntilDestroyed(this.destroyed),
      )
      .subscribe({
        next: (d) => {
          this.draft.set(d);
          if (!this.dirty()) {
            this.manifest.set(d.manifest ?? '');
            this.fragment.set(d.fragment ?? '');
          }
          if (!isWriting(d)) this.changed.emit();
        },
        error: (e) => this.refused.set(this.reasonOf(e)),
      });
  }

  private reasonOf(e: unknown): string {
    return e instanceof AnimationFailure ? e.reason : e instanceof Error ? e.message : String(e);
  }

  /** A picture of the draft with the server's ticket (an `<img>` cannot send the token). */
  protected src(address: string): string {
    return address.startsWith('data:') ? address : this.tickets.withTicket(address);
  }

  protected typeManifest(event: Event): void {
    this.manifest.set((event.target as HTMLTextAreaElement).value);
    this.dirty.set(true);
    this.saved.set(false);
  }

  protected typeFragment(event: Event): void {
    this.fragment.set((event.target as HTMLTextAreaElement).value);
    this.dirty.set(true);
    this.saved.set(false);
  }

  protected useTemplate(): void {
    this.manifest.set(PART_TEMPLATE.manifest);
    this.fragment.set(PART_TEMPLATE.fragment);
    this.dirty.set(true);
    this.saved.set(false);
  }

  protected save(): void {
    if (this.saving() || this.writing()) return;
    this.saving.set(true);
    this.problems.set([]);
    this.saved.set(false);
    this.port
      .saveDraft(this.id(), { manifest: this.manifest(), fragment: this.fragment() })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (d) => {
          this.saving.set(false);
          this.draft.set(d);
          this.dirty.set(false);
          this.saved.set(true);
          this.manifest.set(d.manifest ?? this.manifest());
          this.fragment.set(d.fragment ?? this.fragment());
          this.changed.emit();
        },
        error: (e) => {
          this.saving.set(false);
          this.problems.set(this.reasonOf(e).split('\n').filter((l) => l.trim() !== ''));
        },
      });
  }

  protected retry(): void {
    this.refused.set('');
    this.port
      .retryDraft(this.id())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: () => {
          this.load(this.id());
          this.changed.emit();
        },
        error: (e) => this.refused.set(this.reasonOf(e)),
      });
  }

  protected approve(): void {
    if (!this.canApprove()) return;
    this.approving.set(true);
    this.refused.set('');
    this.port
      .approveDraft(this.id())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (part) => {
          this.approving.set(false);
          this.approved.emit(part.name);
        },
        error: (e) => {
          this.approving.set(false);
          this.refused.set(this.reasonOf(e));
        },
      });
  }

  protected remove(): void {
    if (!this.removing()) {
      this.removing.set(true);
      return;
    }
    this.port
      .removeDraft(this.id())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: () => {
          this.changed.emit();
          this.closed.emit();
        },
        error: (e) => {
          this.removing.set(false);
          this.refused.set(this.reasonOf(e));
        },
      });
  }
}
