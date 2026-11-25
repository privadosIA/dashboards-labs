import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { type DfFormSchema, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { type Detail, type EngineId, type Generation } from '../../port';
import type { MakingStore } from '../making.store';
import en from './dynamic/generate-model.en.json';
import es from './dynamic/generate-model.es.json';

/** The biggest picture the server takes. */
export const MAX_PICTURE_BYTES = 20 * 1024 * 1024;

/**
 * The dialog that starts a generation: a text (a dynamic form in both languages) or a picture, with the engine, the detail, an optional name and the adult mark. Nothing is sent for a text and a picture together or for neither;
 * an engine that cannot be used is said with its reason instead of sending a call that would be refused; the server's refusals stay under the form with what was typed.
 */
@Component({
  selector: 'lab-generate-model',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DynamicFormComponent, MatButtonModule, MatButtonToggleModule, MatDialogModule, MatIconModule],
  templateUrl: './generate-model.html',
  styleUrl: './generate-model.scss',
})
export class GenerateModel {
  private readonly store = inject<MakingStore>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<GenerateModel, Generation | undefined>>(MatDialogRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).making;
  private readonly base = pickSchema('generate-model', { en, es }, this.lang) as DfFormSchema;

  protected readonly source = signal<'text' | 'picture'>('text');
  /** With a picture there is no text field: the schema leaves it out, so nothing of it is asked for or required. */
  protected readonly schema = computed<DfFormSchema>(() => (this.source() === 'picture' ? { ...this.base, fields: this.base.fields.filter((f) => (f as { key?: string }).key !== 'prompt') } : this.base));
  protected readonly model = signal<Record<string, unknown>>({ prompt: '', engine: 'triposr', detail: 'normal', name: '', adult: false });
  protected readonly valid = signal(false);
  protected readonly picture = signal<File | null>(null);
  protected readonly tooBig = computed(() => (this.picture()?.size ?? 0) > MAX_PICTURE_BYTES);
  protected readonly sending = signal(false);
  protected readonly problem = computed(() => this.store.problems()['generate'] ?? '');

  protected readonly engine = computed(() => String(this.model()['engine'] ?? 'triposr'));
  /** Why the chosen engine cannot be used, in words; empty when it can. */
  protected readonly blockedReason = computed(() => {
    const status = this.store.engines()[this.engine()];
    if (!status || status.available) return '';
    return (status.reason && this.t.engines.reasons[status.reason]) || status.detail || this.t.generate.blocked;
  });
  protected readonly noneUsable = computed(() => this.store.usable().length === 0);
  protected readonly hasInput = computed(() => (this.source() === 'text' ? String(this.model()['prompt'] ?? '').trim() !== '' : this.picture() !== null));
  protected readonly canSend = computed(() => this.valid() && this.hasInput() && !this.tooBig() && this.blockedReason() === '' && !this.sending());

  protected pick(event: Event): void {
    this.picture.set((event.target as HTMLInputElement).files?.item(0) ?? null);
    this.store.problems.update(({ generate: _gone, ...rest }) => rest);
  }

  protected setSource(value: 'text' | 'picture'): void {
    this.source.set(value);
    this.store.problems.update(({ generate: _gone, ...rest }) => rest);
  }

  protected async send(): Promise<void> {
    if (!this.canSend()) return;
    const m = this.model();
    const name = String(m['name'] ?? '').trim();
    this.sending.set(true);
    const generation = await this.store.generate({
      ...(this.source() === 'text' ? { prompt: String(m['prompt']).trim() } : { image: this.picture() as File }),
      engine: this.engine() as EngineId,
      detail: String(m['detail'] ?? 'normal') as Detail,
      ...(name ? { name } : {}),
      ...(m['adult'] === true ? { adult: true } : {}),
    });
    this.sending.set(false);
    if (generation) this.ref.close(generation);
  }
}
