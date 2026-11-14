import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import { type Assistant, AssistantPicker } from '@lab/assist-kit';
import { pickSchema } from '@lab/forms-kit';
import type { Subscription } from 'rxjs';

import { VECTOR_EDITOR_LANG } from '../provide-vector-editor';
import { vectorTexts } from '../texts';
import en from './dynamic/describe.en.json';
import es from './dynamic/describe.es.json';
import type { SinkModels, VectorSvgSink } from './sink';

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Asks for a first drawing in words, in a dialog that knows no assistant (the host gives it a `VectorSvgSink`): a description and the choice of the assistant
 * (the picker of `@lab/assist-kit`: the server's routing, a local model or an external provider, with its consent; the model of the routing that fits the memory is the one it starts from). While the model writes, which can take minutes, the
 * dialog says so and can be cancelled; closing it cancels too. A failure puts the server's words above the form with what was typed. On success it emits the
 * SVG text as the model wrote it and closes: the host decides what to do with it (a new document or adding to this one).
 */
@Component({
  selector: 'lab-vector-describe',
  imports: [AssistantPicker, DynamicFormComponent],
  templateUrl: './describe.html',
  styleUrl: './describe.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorDescribe {
  readonly sink = input.required<VectorSvgSink>();
  /** The model the host remembers from the last time; it is used when it is installed and fits. */
  readonly preferred = input('');
  readonly open = model(false);
  /** The SVG the model wrote and the description it came from. */
  readonly written = output<{ svg: string; description: string; model: string; provider: string }>();

  private readonly lang = inject(VECTOR_EDITOR_LANG);
  protected readonly t = vectorTexts(this.lang).describe;
  private readonly base = pickSchema('describe', { en, es }, this.lang);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly destroyed = inject(DestroyRef);

  /** The installed models; `null` until they are read and when they cannot be (no assistant): then the choice is left out. */
  protected readonly models = signal<SinkModels | null>(null);
  protected readonly loading = signal(false);
  protected readonly form = signal<Record<string, unknown>>({ description: '' });
  /** The assistant chosen in the picker: `provider` empty is the server's routing. */
  protected readonly assistant = signal<Assistant>({ provider: '', model: '' });
  protected readonly routingModels = computed(() => (this.models()?.models ?? []).map((m) => m.name));
  protected readonly valid = signal(false);
  protected readonly working = signal(false);
  protected readonly problem = signal('');
  protected readonly modelName = computed(() => this.assistant().model || (this.assistant().provider ? '' : (this.models()?.default ?? '')));

  protected readonly schema: DfFormSchema = this.base;

  private work: Subscription | undefined;

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
    // Each time it opens it starts empty and reads the models again; closing stops whatever is being written.
    effect(() => {
      if (this.open()) untracked(() => this.reset());
      else untracked(() => this.work?.unsubscribe());
    });
    this.destroyed.onDestroy(() => this.work?.unsubscribe());
  }

  private reset(): void {
    this.work?.unsubscribe();
    this.working.set(false);
    this.problem.set('');
    this.models.set(null);
    this.loading.set(true);
    this.form.set({ description: '' });
    this.assistant.set({ provider: '', model: '' });
    this.sink()
      .models()
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (m) => {
          this.models.set(m);
          this.loading.set(false);
          this.assistant.set({ provider: '', model: this.pick(m) });
        },
        error: () => {
          this.models.set(null);
          this.loading.set(false);
        },
      });
  }

  /** The model to start from: the remembered one if it is installed and fits, else the server's default if it fits, else the first that fits, else the default. */
  private pick(m: SinkModels): string {
    const fitting = (name: string): boolean => m.models.some((x) => x.name === name && x.fits);
    const wanted = [this.preferred(), m.default].find((n) => !!n && fitting(n));
    return wanted ?? m.models.find((x) => x.fits)?.name ?? m.default;
  }

  protected backdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement) this.open.set(false);
  }

  protected write(): void {
    const description = String(this.form()['description'] ?? '').trim();
    if (!description || this.working()) return;
    const { provider, model: chosen } = this.assistant();
    this.problem.set('');
    this.working.set(true);
    this.work?.unsubscribe();
    this.work = this.sink()
      .write(description, chosen, provider)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (svg) => {
          this.working.set(false);
          this.written.emit({ svg, description, model: chosen, provider });
          this.open.set(false);
        },
        error: (e: unknown) => {
          this.working.set(false);
          this.problem.set(this.t.notWritten(reason(e)));
        },
      });
  }

  /** Stops waiting for the model and goes back to the form with what was typed. */
  protected cancel(): void {
    this.work?.unsubscribe();
    this.working.set(false);
  }
}
