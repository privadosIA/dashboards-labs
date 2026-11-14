import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import type { Reference, ReferenceInput } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { parseTags, validateReferenceInput } from '../../animation/validate';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import en from '../dynamic/add-reference.en.json';
import es from '../dynamic/add-reference.es.json';

type FormModel = Record<string, unknown>;

/** The form that adds a reference from an address or a video file, with its title, notes and tags. */
@Component({
  selector: 'app-add-reference',
  imports: [DynamicFormComponent],
  templateUrl: './add-reference.html',
  styleUrl: './add-reference.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddReference {
  /** The reference as the server answers: it comes back analysing. */
  readonly added = output<Reference>();

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.references;
  protected readonly schema = pickSchema('add-reference', { en, es }, this.lang);

  protected readonly model = signal<FormModel>({});
  protected readonly valid = signal(true);
  protected readonly file = signal<File | null>(null);
  protected readonly working = signal(false);
  /** The server's reason for refusing, in its own words. */
  protected readonly refused = signal('');

  private readonly input = computed<ReferenceInput>(() => {
    const m = this.model();
    const text = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : '');
    const file = this.file();
    return { ...(file ? { file } : text('url').trim() ? { url: text('url').trim() } : {}), title: text('title'), notes: text('notes'), tags: parseTags(text('tags')) };
  });
  /** An address or a file, not both, and nothing over the limits. */
  protected readonly sourceOk = computed(() => {
    const url = typeof this.model()['url'] === 'string' ? (this.model()['url'] as string).trim() : '';
    return !(this.file() && url) && validateReferenceInput(this.input()).length === 0;
  });

  protected pick(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  protected clear(picker: HTMLInputElement): void {
    picker.value = '';
    this.file.set(null);
  }

  protected add(picker: HTMLInputElement): void {
    if (this.working() || !this.valid() || !this.sourceOk()) return;
    this.working.set(true);
    this.refused.set('');
    this.port
      .addReference(this.input())
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (reference) => {
          this.working.set(false);
          this.model.set({});
          this.clear(picker);
          this.added.emit(reference);
        },
        error: (e) => {
          this.working.set(false);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }
}
