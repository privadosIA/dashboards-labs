import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import { type AssistModels, type Catalog, FEATURE_PLAN } from '@lab/animation-core';
import { pickSchema } from '@lab/forms-kit';
import { ANIMATION } from '@lab/music-motion';
import { SONGS } from '@lab/music-studio-kit';
import { catchError, forkJoin, type Observable, of, switchMap } from 'rxjs';
import { failureOf } from '../execute';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { AssistantPicker } from '@lab/assist-kit';
import type { Assistant, Plan } from '../model';
import { GENERATORS, MAX_SENTENCE, type PlanModel, defaultPlan, modelOfPlan, planFromAssisted, planOfModel, withWritten, writeSong } from '../steps/plan';
import en from '../dynamic/plan.en.json';
import es from '../dynamic/plan.es.json';

/** What the card hands over when the person presses Start. */
export interface PlanStart {
  prompt: string;
  plan: Plan;
}

/**
 * The first card of a flow: one sentence becomes a plan the person edits (the song, the animation's choices, the parts wanted and the assistant's models). Making the plan
 * only asks the assistant to write the song's texts; nothing is created on the server until Start.
 */
@Component({
  selector: 'app-plan-card',
  imports: [AssistantPicker, DynamicFormComponent],
  templateUrl: './plan-card.html',
  styleUrl: './plan-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanCard implements OnInit {
  private readonly destroyed = inject(DestroyRef);
  private readonly animation = inject(ANIMATION);
  private readonly songs = inject(SONGS);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.flow.plan;
  private readonly baseSchema = pickSchema('flow-plan', { en, es }, this.lang);

  readonly started = output<PlanStart>();

  protected readonly max = MAX_SENTENCE;
  protected readonly sentence = signal('');
  protected readonly making = signal(false);
  protected readonly planned = signal(false);
  protected readonly writeFailed = signal('');
  /** What the server said it could not fill, from the one-call plan. */
  protected readonly warnings = signal<string[]>([]);
  /** Why the one-call plan was not used when it was tried and failed. */
  protected readonly notUsed = signal('');
  /** The server plans in one call: the person is told it can take a while. */
  protected readonly oneCall = signal(false);
  protected readonly noModels = signal(false);
  protected readonly invalidParts = signal('');
  protected readonly model = signal<PlanModel>({});
  /** The provider and model for the whole run: the song's writing, the proposals and the drafts. */
  protected readonly assistant = signal<Assistant>({ provider: '', model: '' });
  protected readonly routingModels = computed(() => (this.models()?.models ?? []).map((m) => m.name));
  protected readonly valid = signal(false);
  private readonly catalog = signal<Catalog | null>(null);
  private readonly models = signal<AssistModels | null>(null);

  protected readonly sentenceOk = computed(() => this.sentence().trim().length > 0 && this.sentence().length <= MAX_SENTENCE);
  protected readonly schema = computed<DfFormSchema>(() => this.withOptions(this.baseSchema));

  ngOnInit(): void {
    // the models of the server's own routing are listed at once, so the picker has them before the plan is made
    this.animation
      .assistModels()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyed),
      )
      .subscribe((models) => this.models.set(models));
  }

  protected type(value: string): void {
    this.sentence.set(value);
  }

  /** Reads the catalog and the models and asks the assistant for the song's texts: none of it creates anything. */
  protected make(): void {
    if (!this.sentenceOk() || this.making()) return;
    this.making.set(true);
    this.writeFailed.set('');
    this.warnings.set([]);
    this.notUsed.set('');
    const sentence = this.sentence();
    forkJoin([this.animation.catalog().pipe(catchError(() => of(null))), this.animation.assistModels().pipe(catchError(() => of(null)))])
      .pipe(
        switchMap(([catalog, models]) => {
          this.catalog.set(catalog);
          this.models.set(models);
          this.noModels.set(!models || models.models.length === 0);
          const hasPlan = !!catalog?.features.includes(FEATURE_PLAN) && typeof this.animation.plan === 'function';
          this.oneCall.set(hasPlan);
          return hasPlan ? this.oneCallPlan(sentence, catalog) : this.usualPlan(sentence, catalog);
        }),
      )
      .subscribe((plan) => {
        this.model.set(modelOfPlan(plan));
        this.planned.set(true);
        this.making.set(false);
      });
  }

  /** One call of the server writes the whole plan; a failure falls back to the usual way and says why. Nothing is created on the server. */
  private oneCallPlan(sentence: string, catalog: Catalog | null): Observable<ReturnType<typeof defaultPlan>> {
    const { provider, model } = this.assistant();
    return this.animation.plan({ text: sentence.trim(), generator: 'ace-step', language: this.lang, ...(provider ? { provider } : {}), ...(model ? { model } : {}) }).pipe(
      switchMap((assisted) => {
        this.warnings.set([...assisted.warnings]);
        return of(planFromAssisted(sentence, assisted, catalog, this.assistant()));
      }),
      catchError((e: unknown) => {
        this.notUsed.set(failureOf(e).reason);
        return this.usualPlan(sentence, catalog);
      }),
    );
  }

  /** The plan as the first change makes it: the song's texts from the assistant and the usual values for the animation. */
  private usualPlan(sentence: string, catalog: Catalog | null): Observable<ReturnType<typeof defaultPlan>> {
    const base = defaultPlan(sentence, catalog, {}, this.assistant());
    return writeSong(this.songs, sentence, base.song).pipe(
      switchMap((writing) => {
        if ('failed' in writing) this.writeFailed.set(writing.failed);
        return of('written' in writing ? withWritten(base, sentence, writing.written) : base);
      }),
    );
  }

  protected start(): void {
    if (!this.valid()) return;
    const { plan, invalidParts } = planOfModel(this.model(), this.assistant());
    this.invalidParts.set(invalidParts.join(' | '));
    if (invalidParts.length) return;
    this.started.emit({ prompt: this.sentence().trim(), plan });
  }

  /** A JSON schema cannot know what the server offers: its styles, levels, frame rates and models are set here. */
  private withOptions(schema: DfFormSchema): DfFormSchema {
    const catalog = this.catalog();
    return {
      ...schema,
      fields: schema.fields.map((f) => {
        if (!('key' in f)) return f;
        switch (f.key) {
          case 'generator':
            return { ...f, options: GENERATORS.map((g) => ({ value: g, label: this.t.generators[g] })) };
          case 'animStyle':
            return catalog ? { ...f, options: catalog.styles.map((s) => ({ value: s, label: s })) } : f;
          case 'level':
            return catalog ? { ...f, options: catalog.levels.map((l) => ({ value: l, label: l })) } : f;
          case 'fps':
            return catalog ? { ...f, options: catalog.frameRates.map((r) => ({ value: String(r), label: String(r) })) } : f;
          default:
            return f;
        }
      }),
    };
  }
}
