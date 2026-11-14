import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import { pickSchema } from '@lab/forms-kit';

import { STRICTNESSES, isLearning, type Learning, type Reference, type Strictness } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import en from '../dynamic/learn.en.json';
import es from '../dynamic/learn.es.json';
import { LearningView } from './learning-view/learning-view';

type FormModel = Record<string, unknown>;

/** Whether a learning still changes: it is running, or a part draft it made is still being written (it is read as it is now). */
const pending = (l: Learning): boolean => isLearning(l) || l.partDrafts.some((d) => d.state === 'writing');

/**
 * Asking the server to learn from a reference and showing what came of it: the strictness, the button, the learning while it runs (read again every
 * `pollMs` until it ends, and no longer once the page is left) and the earlier learnings of the reference. Nothing it makes enters the catalog by itself.
 */
@Component({
  selector: 'app-learn-section',
  imports: [DynamicFormComponent, LearningView],
  templateUrl: './learn-section.html',
  styleUrl: './learn-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearnSection implements OnInit {
  readonly reference = input.required<Reference>();
  /** Milliseconds between two reads of a running learning. */
  readonly pollMs = input(2000);

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.references.learn;
  private readonly lang = inject(LanguageService).lang;
  private readonly base = pickSchema('learn', { en, es }, this.lang);
  protected readonly schema = computed(() => ({
    ...this.base,
    fields: this.base.fields.map((f) => ('key' in f && f.key === 'strictness' ? { ...f, options: STRICTNESSES.map((s) => ({ value: s, label: this.t.strictnesses[s] })) } : f)),
  }));
  protected readonly model = signal<FormModel>({ strictness: 'normal' });

  /** The learning on view: the running one, or the one the person opened from the history. */
  protected readonly current = signal<Learning | null>(null);
  protected readonly history = signal<readonly Learning[]>([]);
  protected readonly starting = signal(false);
  protected readonly refused = signal('');

  protected readonly ready = computed(() => this.reference().state === 'ready');
  protected readonly running = computed(() => !!this.current() && isLearning(this.current()!));
  protected readonly canLearn = computed(() => this.ready() && !this.starting() && !this.running());
  protected readonly strictness = computed<Strictness>(() => {
    const s = this.model()['strictness'];
    return STRICTNESSES.includes(s as Strictness) ? (s as Strictness) : 'normal';
  });

  private following?: Subscription;

  constructor() {
    // Leaving the page stops the reading: the learning goes on in the server.
    this.destroyed.onDestroy(() => this.following?.unsubscribe());
  }

  ngOnInit(): void {
    this.reload(true);
  }

  /** Reads the history; the newest learning is the one on view, and is followed when it is still running. */
  private reload(pick: boolean): void {
    this.port
      .learnings(this.reference().id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (list) => {
          this.history.set(list);
          if (pick && list.length > 0) {
            this.current.set(list[0]);
            if (pending(list[0])) this.follow(list[0].id);
          }
        },
        error: (e) => this.refused.set(failureText(e, this.texts)),
      });
  }

  protected learn(): void {
    if (!this.canLearn()) return;
    this.starting.set(true);
    this.refused.set('');
    this.port
      .learn(this.reference().id, this.strictness())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (l) => {
          this.starting.set(false);
          this.current.set(l);
          if (pending(l)) this.follow(l.id);
          else this.reload(false);
        },
        error: (e) => {
          this.starting.set(false);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }

  /** Reads a learning again until it has ended and its drafts are written, or until another one is put on view. */
  private follow(id: string): void {
    this.following?.unsubscribe();
    this.following = timer(this.pollMs(), this.pollMs())
      .pipe(
        switchMap(() => this.port.learning(id)),
        takeWhile((l) => pending(l), true),
        takeUntilDestroyed(this.destroyed),
      )
      .subscribe({
        next: (l) => {
          if (this.current()?.id === id) this.current.set(l);
          if (!pending(l)) this.reload(false);
        },
        error: (e) => this.refused.set(failureText(e, this.texts)),
      });
  }

  /** Puts an earlier learning on view. */
  protected open(l: Learning): void {
    this.following?.unsubscribe();
    this.current.set(l);
    if (pending(l)) this.follow(l.id);
  }

  protected summary(l: Learning): string {
    return l.state === 'ready' ? this.t.summary(l.styles.length, l.partDrafts.length, l.discarded.length) : l.state === 'running' ? this.t.running : this.t.failed;
  }

  protected when(l: Learning): string {
    return new Date(l.createdAt).toLocaleString(this.lang);
  }
}
