import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { formatMegabytes, formatSeconds } from '../shared/format';
import { defaultModelId, withModels } from '../shared/with-models';
import { loadInputs } from '../video/fetch-inputs';
import { carriesFiles, forModel, hasAnyImage, inputsOf } from '../video/inputs';
import { ASPECT_RATIOS, NO_REFERENCES, QUALITIES, takesReferences, type AspectRatio, type GenerationSettings, type Quality, type References, type StartImage as Image } from '../video/model';
import { PROMPT_MAX, fullPrompt } from '../video/prompt';
import { VIDEO_GENERATION } from '../video/tokens';
import { validate } from '../video/validate';
import en from './dynamic/create-panel.en.json';
import es from './dynamic/create-panel.es.json';
import { Frames } from './frames/frames';
import { HeaderCard } from './header-card/header-card';
import { ReferencesList } from './references/references';
import { SettingsRow, type RowOption } from './settings-row/settings-row';

/** The durations the picker offers at once; any whole number of seconds the server accepts can be typed. */
const DURATION_PRESETS = [5, 10, 15, 20, 30];

type FormModel = Record<string, unknown>;

/** `firstImage` is the image the prompt may lean on (the start image or the first reference): the form's rule for a prompt that is not needed reads it. */
const toModel = (s: GenerationSettings): FormModel => ({ ...s, firstImage: hasAnyImage(s) ? true : null });

/** The settings the form holds. A number field is `null` when empty, which no duration accepts. */
const toSettings = (m: FormModel): GenerationSettings => ({
  prompt: String(m['prompt'] ?? ''),
  startImage: (m['startImage'] as Image | null | undefined) ?? null,
  model: String(m['model'] ?? ''),
  duration: m['duration'] == null || m['duration'] === '' ? NaN : Number(m['duration']),
  aspectRatio: m['aspectRatio'] as AspectRatio,
  quality: m['quality'] as Quality,
  audio: m['audio'] === true,
  sound: String(m['sound'] ?? ''),
  endImage: (m['endImage'] as Image | null | undefined) ?? null,
  references: (m['references'] as References | undefined) ?? NO_REFERENCES,
  ...(m['reuse'] ? { reuse: m['reuse'] as GenerationSettings['reuse'] } : {}),
});

@Component({
  selector: 'app-create-panel',
  templateUrl: './create-panel.html',
  styleUrl: './create-panel.scss',
  imports: [DynamicFormComponent, DfSlotDirective, Frames, ReferencesList, HeaderCard, SettingsRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePanel {
  /** The settings to edit. The page pushes new ones (repeating a generation) and the panel loads them into the form. */
  readonly settings = input.required<GenerationSettings>();
  readonly generate = output<GenerationSettings>();

  private readonly port = inject(VIDEO_GENERATION);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  private readonly baseSchema = pickSchema('create-panel', { en, es }, this.lang);

  protected readonly models = toSignal(this.port.models(), { initialValue: [] });
  private readonly usable = computed(() => this.models().filter((m) => m.available));
  protected readonly schema = computed(() => withModels(this.baseSchema, this.models(), this.t.unavailable));
  protected readonly model = signal<FormModel>({});
  protected readonly valid = signal(false);
  protected readonly modelRow = viewChild.required<SettingsRow>('modelRow');
  protected readonly current = computed(() => toSettings(this.model()));
  /** What the chosen model takes besides the prompt. */
  protected readonly inputs = computed(() => inputsOf(this.models().find((m) => m.id === this.current().model)));
  protected readonly showFrames = computed(() => this.inputs().startImage && !takesReferences(this.inputs()));
  protected readonly showEnd = computed(() => this.inputs().endImage && this.showFrames());
  protected readonly showReferences = computed(() => takesReferences(this.inputs()));
  /**
   * What is sent: only the inputs the model takes (the others stay in the panel and come back with the model), and, while the
   * files of a repeated generation are untouched, no file at all but the ask to reuse them.
   */
  protected readonly outgoing = computed(() => {
    const sent = forModel(this.current(), this.inputs());
    return sent.reuse ? { ...sent, startImage: null, endImage: null, references: NO_REFERENCES } : sent;
  });
  protected readonly problems = computed(() => validate(this.outgoing(), this.usable().map((m) => m.id), this.soundable(), this.inputs()));
  /** Why Generate is stopped by the inputs, in words: the first problem of the end image or the references. */
  protected readonly inputReason = computed(() => {
    const texts = this.t.inputs.problems;
    const found = this.problems().find((p) => texts[p]);
    return found ? (texts[found] ?? '') : '';
  });
  protected readonly loadingInputs = signal(false);
  protected readonly loadFailed = signal(false);
  private readonly tickets = inject(TicketService);
  private readonly form = viewChild.required(DynamicFormComponent);
  /**
   * What stops Generate before it is pressed: only the problems that already say so where they are (the duration, the length
   * of the prompt, the model). A missing prompt is not one: it is said when Generate is pressed, not on opening the page.
   */
  protected readonly blocked = computed(() => this.problems().some((p) => p !== 'prompt-required'));
  protected readonly modelOptions = computed<RowOption[]>(() =>
    this.models().map((m) => ({ value: m.id, label: m.available ? m.name : `${m.name} ${this.t.unavailable}`, disabled: !m.available })),
  );
  protected readonly modelName = computed(() => this.models().find((m) => m.id === this.current().model)?.name ?? '');
  protected readonly durationOptions: RowOption[] = DURATION_PRESETS.map((n) => ({ value: String(n), label: this.seconds(n) }));
  protected readonly durationValue = computed(() => (Number.isNaN(this.current().duration) ? '–' : this.seconds(this.current().duration)));
  protected readonly durationSelected = computed(() => String(this.current().duration));
  protected readonly durationError = computed(() => {
    const p = this.problems();
    return p.includes('duration-not-whole') ? this.t.panel.durationWhole : p.includes('duration-range') ? this.t.panel.durationRange : '';
  });
  protected readonly ratioOptions: RowOption[] = ASPECT_RATIOS.map((v) => ({ value: v, label: v }));
  protected readonly qualityOptions: RowOption[] = QUALITIES.map((v) => ({ value: v, label: v }));
  protected readonly image = computed(() => toSettings(this.model()).startImage);
  protected readonly endImage = computed(() => toSettings(this.model()).endImage ?? null);
  protected readonly refs = computed(() => toSettings(this.model()).references ?? NO_REFERENCES);
  protected readonly description = computed(() => this.models().find((m) => m.id === toSettings(this.model()).model)?.description ?? '');
  /** The chosen model writes sound (it may, when the port does not say). `soundable` in the form's model is a copy of this for the schema's rules. */
  protected readonly soundable = computed(() => this.models().find((m) => m.id === toSettings(this.model()).model)?.audio !== false);
  /** The Sound field is on screen: Audio is ticked and the model writes sound. */
  protected readonly soundShown = computed(() => this.soundable() && toSettings(this.model()).audio);
  private readonly length = computed(() => fullPrompt(toSettings(this.model()), this.soundable()).length);
  protected readonly over = computed(() => Math.max(0, this.length() - PROMPT_MAX));
  protected readonly countText = computed(() => this.t.panel.soundCount.replace('{left}', String(Math.max(0, PROMPT_MAX - this.length()))).replace('{max}', String(PROMPT_MAX)));
  protected readonly tooLongText = computed(() => (this.over() ? this.t.panel.promptTooLong.replace('{over}', String(this.over())).replace('{max}', String(PROMPT_MAX)) : ''));
  protected readonly estimate = computed(() => {
    const current = toSettings(this.model());
    if (validate(current).some((p) => p.startsWith('duration'))) return null;
    const { seconds, megabytes } = this.port.estimate(current);
    return { time: formatSeconds(seconds), size: formatMegabytes(megabytes) };
  });

  constructor() {
    effect(() => {
      const settings = this.settings();
      this.model.set(toModel(settings));
      this.loadFailed.set(false);
      // The files of a repeated generation come back from the server so they can be shown and changed; until one is
      // changed the generation is asked to reuse them and none is sent again.
      if (settings.reuse && !carriesFiles(settings)) untracked(() => void this.loadReused(settings.reuse as NonNullable<GenerationSettings['reuse']>));
    });
    // The form's rules read `soundable` from its model: it follows the chosen model. A model that makes no sound unticks
    // Audio; one that does ticks it again when the model changes to it, and leaves the person's choice alone otherwise.
    effect(() => {
      const soundable = this.soundable();
      const current = this.model();
      if (current['soundable'] === soundable) return;
      untracked(() => this.model.set({ ...current, soundable, audio: soundable ? (current['soundable'] === false ? true : current['audio']) : false }));
    });
    // A model the port does not list as available (none yet, one that went away or one that cannot be used) is replaced by its default, whenever either changes.
    effect(() => {
      const ids = this.usable().map((m) => m.id);
      const current = this.model();
      if (ids.length && !ids.includes(String(current['model'] ?? ''))) this.model.set({ ...current, model: defaultModelId(this.models())! });
    });
  }

  private async loadReused(reuse: NonNullable<GenerationSettings['reuse']>): Promise<void> {
    this.loadingInputs.set(true);
    try {
      const files = await loadInputs(reuse.inputs, (u) => this.tickets.withTicket(u));
      // Only when the panel still holds that generation's inputs (the person may have changed them or loaded another).
      if (this.model()['reuse'] && (this.model()['reuse'] as NonNullable<GenerationSettings['reuse']>).of === reuse.of) {
        this.model.update((m) => ({ ...m, ...files, firstImage: files.startImage || files.references.images.length ? true : null }));
      }
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loadingInputs.set(false);
    }
  }

  /** Any change to the inputs means the files are sent from now on: the server's copies are no longer the ones asked for. */
  private changeInputs(patch: Record<string, unknown>): void {
    this.model.update((m) => {
      const next = { ...m, ...patch, reuse: undefined };
      return { ...next, firstImage: hasAnyImage(toSettings(next)) ? true : null };
    });
  }

  private seconds(n: number): string {
    return this.t.panel.seconds.replace('{n}', String(n));
  }

  protected set(key: 'model' | 'duration' | 'aspectRatio' | 'quality', value: unknown): void {
    this.model.update((m) => ({ ...m, [key]: value }));
  }

  /** A duration typed in the picker: an empty box is no duration, anything else is checked by the rules like the presets. */
  protected typeDuration(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.set('duration', text === '' ? null : Number(text));
  }

  /** Makes an image the start image, as if it had been chosen here (the Edit tab hands over a retouched one). */
  useStartImage(startImage: Image): void {
    this.setImage(startImage);
  }

  protected setImage(startImage: Image | null): void {
    this.changeInputs({ startImage });
  }

  protected setEnd(endImage: Image | null): void {
    this.changeInputs({ endImage });
  }

  protected setReferences(references: References): void {
    this.changeInputs({ references });
  }

  /** Pressing Generate: the form checks itself (and shows what is missing), then submits when it is valid. */
  protected press(): void {
    this.form().submit();
  }

  /** The library only submits a valid form; `validate` is the last check, the same rule the adapters apply. */
  protected submit(): void {
    const sent = this.outgoing();
    if (!validate(sent, this.usable().map((m) => m.id), this.soundable(), this.inputs()).length) this.generate.emit(sent);
  }
}
