import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ANIMATION } from '@lab/animation-core';
import { DynamicFormComponent, type DfFormSchema } from '@core/dynamic-forms';
import { RouterLink } from '@angular/router';
import { ASSIST_PROVIDERS, type ProviderInfo } from '@lab/assist-kit';
import { pickSchema } from '@lab/forms-kit';
import { catchError, of, type Subscription } from 'rxjs';

import { type SavePresetRequest, DatasetActions } from '../actions/actions';
import { Brief } from '../brief/brief';
import { AssistantChoice } from '../core/assistant-choice';
import { LanguageService } from '../core/language';
import { DATASET_STUDIO_BASE, DATASET_STUDIO_OPTIONS } from '../core/options';
import { textsFor } from '../core/texts';
import type { EngineCard } from '../engines/model';
import { EnginesPanel } from '../engines/engines-panel/engines-panel';
import { ENGINES } from '../engines/port';
import { type GenWarning, type Progress, generate } from '../generate/generators';
import { readFeatures } from '../generate/features';
import { parseTuples, serializeTuples, type Tuple } from '../generate/tuples';
import { type Example, GenerateFailed, WRITER } from '../generate/writer';
import { KINDS, type KindId, briefFits, generationMode, isTupleKind, kindOf } from '../kinds/kinds';
import { type LookId, sceneLines } from '../looks/looks';
import { PresetBrowser } from '../presets/browser/preset-browser';
import { type Preset, presetKindOf } from '../presets/model';
import { PROMPTS } from '../presets/port';
import { chooseExamples } from '../presets/rank';
import { DatasetPreview } from '../preview/dataset-preview';
import { NO_STATUS, type PreviewStatus } from '../preview/status';
import { DRAFT_STORAGE, STUDIO_STEPS, type StudioStep, clearDraft, isEmptyDraft, readDraft, saveDraft } from './draft-storage';
import en from './dynamic/options.en.json';
import es from './dynamic/options.es.json';

const MUSIC_GENERATORS = ['ace-step', 'heartmula', 'diffrhythm2'];

/**
 * The studio: pick a kind, see which engines this server can run now, write the brief (with a look, a negative and presets to fill it from), choose the assistant, generate, read the dataset and the server's own report, edit it, and only
 * then download it or create the project. The brief in progress is kept in the browser and offered on return. Nothing is created until Create is pressed.
 */
@Component({
  selector: 'lab-dataset-studio-page',
  imports: [RouterLink, Brief, DatasetActions, DatasetPreview, DynamicFormComponent, EnginesPanel, PresetBrowser],
  templateUrl: './dataset-studio.page.html',
  styleUrl: './dataset-studio.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetStudioPage {
  private readonly animation = inject(ANIMATION);
  private readonly writer = inject(WRITER);
  private readonly engines = inject(ENGINES);
  private readonly prompts = inject(PROMPTS);
  private readonly providers = inject(ASSIST_PROVIDERS);
  private readonly destroyed = inject(DestroyRef);
  private readonly language = inject(LanguageService).lang;
  protected readonly debounceMs = inject(DATASET_STUDIO_OPTIONS, { optional: true })?.debounceMs ?? 500;
  private readonly all = textsFor(this.language);
  protected readonly t = this.all.page;
  protected readonly kt = this.all.kind;
  protected readonly actionsT = this.all.actions;
  private readonly optionsSchema = pickSchema('dataset-options', { en, es }, this.language) as DfFormSchema;

  protected readonly stepIds = STUDIO_STEPS;
  protected readonly step = signal<StudioStep>('brief');
  /** What each step has in it, for the marks of the step bar. */
  protected readonly stepFilled = computed<Record<StudioStep, boolean>>(() => ({ brief: this.brief().trim() !== '', presets: this.pinned().length > 0, generate: this.generating() || this.hasRaw(), result: this.hasRaw() }));

  protected readonly kinds = KINDS;
  protected readonly kindId = signal<KindId>('video');
  protected readonly kind = computed(() => kindOf(this.kindId()));
  protected readonly features = toSignal(readFeatures(this.animation), { initialValue: [] as readonly string[] });
  protected readonly mode = computed(() => generationMode(this.kind(), this.features()));

  protected readonly engine = signal('');
  protected readonly imageModels = signal<readonly EngineCard[]>([]);
  protected readonly brief = signal('');
  protected readonly negative = signal('');
  protected readonly look = signal<LookId | ''>('');
  protected readonly options = signal<Record<string, unknown>>({ variants: 1, instrumental: false });
  /** The assistant is chosen in the Providers tab and lives in the studio, not in this page. */
  protected readonly assistant = inject(AssistantChoice).value;
  protected readonly providersLink = `${inject(DATASET_STUDIO_BASE)}/providers`;
  /** Whether the built-in Ollama answers (null until it is known). */
  private readonly ollamaUp = signal<boolean | null>(null);
  /** Nothing to write with: no Ollama to talk to and no provider chosen. */
  protected readonly noAssistant = computed(() => this.ollamaUp() === false && this.assistant().provider === '');
  protected readonly assistantName = computed(() => {
    const id = this.assistant().provider;
    return id ? (this.providerList().find((p) => p.id === id)?.name ?? id) : this.t.assistantRouting;
  });
  /** The providers the server lists, read again whenever the choice changes (one may have just been added). */
  private readonly providerList = signal<readonly ProviderInfo[]>([]);

  protected readonly pinned = signal<readonly Preset[]>([]);
  protected readonly presetVersion = signal(0);
  private readonly library = signal<readonly Preset[]>([]);
  protected readonly presetNote = signal('');
  protected readonly presetProblem = signal('');

  private readonly raws = signal<Partial<Record<KindId, string>>>({});
  protected readonly raw = computed(() => this.raws()[this.kindId()] ?? '');
  protected readonly status = signal<PreviewStatus>(NO_STATUS);

  protected readonly generating = signal(false);
  protected readonly progress = signal<Progress | null>(null);
  protected readonly failure = signal('');
  protected readonly stoppedAt = signal<number | null>(null);
  private run: Subscription | null = null;

  protected readonly draftFound = signal(false);
  private readonly storage = inject(DRAFT_STORAGE);
  private storedDraft = readDraft(this.storage);

  /** The options the kind has: variants for images, instrumental for songs. */
  protected readonly optionsFormSchema = computed<DfFormSchema>(() => {
    const id = this.kindId();
    return { ...this.optionsSchema, fields: this.optionsSchema.fields.filter((f) => ('key' in f) && ((f.key === 'variants' && id === 'images') || (f.key === 'instrumental' && id === 'songs'))) } as DfFormSchema;
  });
  protected readonly hasOptions = computed(() => this.optionsFormSchema().fields.length > 0);

  /**
   * What a generation sends as examples: the presets the person pinned, and, only when the server takes examples on its calls, the best matches. A server that does not take them would have them put into the text
   * itself, and that is done for what the person chose, never for a guess.
   */
  protected readonly examples = computed<readonly Preset[]>(() => {
    if (this.pinned().length) return this.pinned().slice(0, 5);
    if (!this.features().includes('examples')) return [];
    return chooseExamples(this.library(), [], { kind: presetKindOf(this.kindId()), engine: this.engine(), text: this.brief() });
  });
  protected readonly matchesTaken = computed(() => this.features().includes('examples'));
  protected readonly external = computed(() => {
    const id = this.assistant().provider;
    const info = id ? this.providerList().find((p) => p.id === id) : undefined;
    return info && info.remote && !info.builtin ? info.name : '';
  });

  /** Why Generate is off, in words; empty when it can go. */
  protected readonly whyOff = computed(() => {
    const kind = this.kind();
    const brief = this.brief();
    if (!brief.trim()) return this.t.whyOff.empty;
    const fits = briefFits(kind, brief);
    if (!fits.ok) return this.t.whyOff.over(kind.limit);
    if (this.mode() === 'lines' && sceneLines(brief).length === 0) return this.t.whyOff.noScenes;
    if (this.noAssistant()) return this.t.whyOff.noAssistant;
    return '';
  });
  protected readonly warnings = computed<readonly GenWarning[]>(() => this.progress()?.warnings ?? []);
  protected readonly isSong = computed(() => this.kindId() === 'songs');
  protected readonly hasRaw = computed(() => this.raw().trim() !== '');

  constructor() {
    this.draftFound.set(!!this.storedDraft && !isEmptyDraft(this.storedDraft));
    this.providers
      .reachable()
      .pipe(takeUntilDestroyed(this.destroyed), catchError(() => of(false)))
      .subscribe((up) => this.ollamaUp.set(up));
    effect(() => {
      this.assistant();
      untracked(() =>
        this.providers
          .list()
          .pipe(takeUntilDestroyed(this.destroyed), catchError(() => of([] as ProviderInfo[])))
          .subscribe((list) => this.providerList.set(list)),
      );
    });
    // The image models, for the look's recommendation and for the model card of Images.
    effect(() => {
      const kind = this.kind();
      untracked(() => {
        if (!kind.panels.look) return this.imageModels.set([]);
        this.engines
          .load('image-models')
          .pipe(takeUntilDestroyed(this.destroyed))
          .subscribe({ next: (v) => this.imageModels.set(v.kind === 'images' ? v.cards : []), error: () => this.imageModels.set([]) });
      });
    });
    // The presets of the kind, to rank examples from.
    effect(() => {
      const kind = presetKindOf(this.kindId());
      this.presetVersion();
      untracked(() =>
        this.prompts
          .list({ kind, limit: 200 })
          .pipe(takeUntilDestroyed(this.destroyed))
          .subscribe({ next: (r) => this.library.set(r.items), error: () => this.library.set([]) }),
      );
    });
    // The draft is kept as it changes, but only once the person has said what to do with the one found.
    effect(() => {
      const draft = { kind: this.kindId(), brief: this.brief(), negative: this.negative(), look: this.look(), raws: this.raws(), step: this.step() };
      if (untracked(() => this.draftFound())) return;
      untracked(() => saveDraft(draft, this.storage));
    });
    this.destroyed.onDestroy(() => this.run?.unsubscribe());
  }

  protected chooseKind(id: KindId): void {
    if (id === this.kindId()) return;
    this.cancel();
    this.kindId.set(id);
    this.engine.set('');
    this.failure.set('');
    this.stoppedAt.set(null);
    this.progress.set(null);
    this.presetNote.set('');
    this.presetProblem.set('');
  }

  protected restoreDraft(): void {
    const d = this.storedDraft;
    if (d) {
      this.kindId.set(d.kind);
      this.brief.set(d.brief);
      this.negative.set(d.negative);
      this.look.set(d.look);
      this.raws.set(d.raws);
      this.step.set(d.step ?? 'brief');
    }
    this.draftFound.set(false);
  }

  protected discardDraft(): void {
    clearDraft(this.storage);
    this.storedDraft = null;
    this.draftFound.set(false);
  }

  protected setRaw(value: string): void {
    this.raws.update((r) => ({ ...r, [this.kindId()]: value }));
  }

  protected onRecommend(modelId: string): void {
    // Images: the recommended model becomes the chosen one; for video it is only a note (the video engine is a different choice).
    if (this.kindId() === 'images') this.engine.set(modelId);
  }

  protected insertPreset(p: Preset): void {
    this.brief.set(p.prompt);
    if (p.negative !== undefined) this.negative.set(p.negative);
    if (this.kindId() === 'songs' && p.engine && MUSIC_GENERATORS.includes(p.engine)) this.engine.set(p.engine);
    this.step.set('brief');
  }

  /** The step bar moves with the arrows, Home and End; the tab it lands on takes the focus. */
  protected onStepKey(event: KeyboardEvent): void {
    const at = this.stepIds.indexOf(this.step());
    const next = event.key === 'ArrowRight' ? (at + 1) % this.stepIds.length : event.key === 'ArrowLeft' ? (at + this.stepIds.length - 1) % this.stepIds.length : event.key === 'Home' ? 0 : event.key === 'End' ? this.stepIds.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    this.step.set(this.stepIds[next]);
    queueMicrotask(() => (event.currentTarget as HTMLElement | null)?.parentElement?.querySelector<HTMLElement>(`[data-testid="step-${this.stepIds[next]}"]`)?.focus());
  }

  private existingTuples(): Tuple[] {
    if (!this.isSong()) return [];
    const parsed = parseTuples(this.raw());
    return parsed.ok ? parsed.entries : [];
  }

  protected start(): void {
    if (this.whyOff() || this.generating()) return;
    const kind = this.kind();
    this.failure.set('');
    this.stoppedAt.set(null);
    this.generating.set(true);
    const examples: Example[] = this.examples().map((p) => ({ prompt: p.prompt, ...(p.negative ? { negative: p.negative } : {}), ...(p.tags.length ? { tags: p.tags } : {}) }));
    const opts = this.options();
    this.run?.unsubscribe();
    this.run = generate(
      { writer: this.writer, animation: this.animation },
      {
        kind,
        mode: this.mode(),
        brief: this.brief(),
        negative: this.negative(),
        engine: this.isSong() ? '' : this.engine(),
        generator: this.isSong() && MUSIC_GENERATORS.includes(this.engine()) ? this.engine() : 'ace-step',
        instrumental: this.isSong() && opts['instrumental'] === true,
        variants: Number(opts['variants'] ?? 1) || 1,
        language: this.language,
        assistant: this.assistant(),
        examples,
        features: this.features(),
        existing: this.existingTuples(),
      },
    ).subscribe({
      next: (p) => {
        this.progress.set(p);
        if (p.piece) this.setRaw(JSON.stringify(p.piece, null, 2));
        else if (isTupleKind(kind) && (p.tuples.length || p.finished)) this.setRaw(serializeTuples(p.tuples));
      },
      error: (e: unknown) => {
        this.generating.set(false);
        const kindOfFailure = e instanceof GenerateFailed ? e.kind : (e as { kind?: string })?.kind;
        const known = kindOfFailure && kindOfFailure in this.t.failure ? this.t.failure[kindOfFailure as keyof typeof this.t.failure] : '';
        this.failure.set(known ? this.t.failureWith(known, e instanceof Error && e.message !== kindOfFailure ? e.message : '') : e instanceof Error ? e.message : String(e));
      },
      complete: () => {
        this.generating.set(false);
        // what was written is read in Result: a run that wrote nothing keeps the person where they are
        if (!this.failure() && this.hasRaw()) this.step.set('result');
      },
    });
  }

  /** Stops the run: what was written so far stays. */
  protected stop(): void {
    this.cancel();
    this.stoppedAt.set(this.progress()?.tuples.length ?? 0);
  }

  private cancel(): void {
    this.run?.unsubscribe();
    this.run = null;
    this.generating.set(false);
  }

  protected savePreset(request: SavePresetRequest): void {
    this.presetNote.set('');
    this.presetProblem.set('');
    this.prompts
      .add({
        kind: presetKindOf(this.kindId()),
        title: request.title,
        prompt: this.brief().trim(),
        ...(this.negative().trim() ? { negative: this.negative().trim() } : {}),
        tags: this.look() ? [this.look() as string] : [],
        ...(this.engine() ? { engine: this.engine() } : {}),
        language: this.language,
        source: 'user',
        licence: 'own',
      })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (p) => {
          this.presetNote.set(this.actionsT.presetSaved(p.title));
          this.presetVersion.update((n) => n + 1);
        },
        error: (e: unknown) => this.presetProblem.set(this.actionsT.presetFailed(e instanceof Error ? e.message : String(e))),
      });
  }

  protected warningText(w: GenWarning): string {
    switch (w.code) {
      case 'examples-inline':
        return this.t.warning['examples-inline'](w.count);
      case 'kept-as-written':
        return this.t.warning['kept-as-written'](w.line);
      case 'server':
        return this.t.warning.server(w.detail);
      case 'no-plan':
        return this.t.warning['no-plan'];
    }
  }

  protected generateLabel(): string {
    const n = this.examples().length;
    return this.hasRaw() && this.isSong() ? this.t.generateAgain(n) : this.t.generate(n);
  }
}
