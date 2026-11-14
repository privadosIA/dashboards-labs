import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { LanguageService } from '../core/language';
import { VIDEO_STUDIO_OPTIONS } from '../core/options';
import { textsFor } from '../core/texts';
import { defaultModelId, withModels } from '../shared/with-models';
import { DEFAULT_EDIT, type EditRequest, type EditResult } from '../retouch/model';
import { IMAGE_EDIT } from '../retouch/tokens';
import { validateEdit } from '../retouch/validate';
import type { StartImage } from '../video/model';
import en from './dynamic/retouch.en.json';
import es from './dynamic/retouch.es.json';
import { withModelFields } from './with-model-fields';

type FormModel = Record<string, unknown>;

/** The request the form holds. A number field is `null` when empty, which no strength or count accepts. */
const toRequest = (image: StartImage, m: FormModel): EditRequest => ({
  image,
  model: String(m['model'] ?? ''),
  prompt: String(m['prompt'] ?? ''),
  negativePrompt: String(m['negativePrompt'] ?? ''),
  strength: m['strength'] == null || m['strength'] === '' ? NaN : Number(m['strength']),
  variants: m['variants'] == null || m['variants'] === '' ? NaN : Number(m['variants']),
});

/** Retouches the start image: asks what to change, shows the variants and closes with the one chosen, or with nothing. */
@Component({
  selector: 'app-retouch-dialog',
  templateUrl: './retouch.dialog.html',
  styleUrl: './retouch.dialog.scss',
  imports: [DynamicFormComponent, DfSlotDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetouchDialog {
  protected readonly image = inject<StartImage>(MAT_DIALOG_DATA);
  /** The in-memory adapter gives the original image back: only then does the dialog say so. */
  protected readonly simulated = inject(VIDEO_STUDIO_OPTIONS, { optional: true })?.memory === true;
  private readonly ref = inject<MatDialogRef<RetouchDialog, StartImage>>(MatDialogRef);
  private readonly port = inject(IMAGE_EDIT);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang);
  private readonly baseSchema = pickSchema('retouch', { en, es }, this.lang);

  private readonly models = toSignal(this.port.models(), { initialValue: [] });
  protected readonly model = signal<FormModel>({ ...DEFAULT_EDIT });
  private readonly selectedModel = computed(() => this.models().find((m) => m.id === String(this.model()['model'] ?? '')));
  protected readonly schema = computed(() => withModelFields(withModels(this.baseSchema, this.models(), this.t.unavailable), this.selectedModel()));
  protected readonly valid = signal(false);
  protected readonly working = signal(false);
  protected readonly error = signal('');
  protected readonly results = signal<readonly EditResult[]>([]);
  protected readonly selected = signal<number | null>(null);
  protected readonly canUse = computed(() => this.selected() !== null && !this.working());

  constructor() {
    // A model the port does not list as available (none yet, because the list has not arrived) is replaced by its default.
    effect(() => {
      const ids = this.models().filter((m) => m.available).map((m) => m.id);
      const current = this.model();
      if (ids.length && !ids.includes(String(current['model'] ?? ''))) this.model.set({ ...current, model: defaultModelId(this.models())! });
    });
    // The variants of a model that makes fewer than were written come down to what it makes; what else was written stays.
    effect(() => {
      const max = this.selectedModel()?.maxVariants;
      if (max === undefined) return;
      const current = untracked(this.model);
      const written = Number(current['variants']);
      if (max <= 1 || (Number.isFinite(written) && written > max)) this.model.set({ ...current, variants: max });
    });
  }

  /** The form only submits when valid; `validateEdit` is the last check, the same rule the adapters apply. */
  protected retouch(): void {
    const request = toRequest(this.image, this.model());
    if (this.working() || validateEdit(request, this.models()).length) return;
    this.working.set(true);
    this.error.set('');
    this.port.edit(request).subscribe({
      next: (results) => {
        this.results.set(results);
        this.selected.set(null);
        this.working.set(false);
      },
      error: (e: unknown) => {
        this.error.set(e instanceof Error ? e.message : String(e));
        this.working.set(false);
      },
    });
  }

  protected use(): void {
    const index = this.selected();
    if (index !== null) this.ref.close(this.results()[index].image);
  }

  protected cancel(): void {
    this.ref.close();
  }
}
