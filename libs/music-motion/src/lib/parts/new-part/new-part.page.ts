import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { ANIMATION } from '../../animation/tokens';
import { injectLink } from '../../core/links';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import { PartPreview } from '../part-preview/part-preview';
import en from '../dynamic/edit-draft.en.json';
import es from '../dynamic/edit-draft.es.json';
import { PART_TEMPLATE } from './template';

type FormModel = Record<string, unknown>;

/**
 * A part written from scratch: the two texts, starting from a template, saved as a draft with no assistant. The draft page takes it from there
 * (preview, changes, approval), also when the text did not pass: that draft is `failed` with its problems and the text to fix.
 */
@Component({
  selector: 'app-new-part-page',
  imports: [DynamicFormComponent, RouterLink, PartPreview],
  templateUrl: './new-part.page.html',
  styleUrl: './new-part.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewPartPage {
  private readonly port = inject(ANIMATION);
  private readonly router = inject(Router);
  private readonly destroyed = inject(DestroyRef);
  protected readonly link = injectLink();
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.parts;
  protected readonly schema = pickSchema('edit-draft', { en, es }, this.lang);

  protected readonly model = signal<FormModel>({ manifest: PART_TEMPLATE.manifest, fragment: PART_TEMPLATE.fragment });
  protected readonly manifestText = computed(() => String(this.model()['manifest'] ?? ''));
  protected readonly fragmentText = computed(() => String(this.model()['fragment'] ?? ''));
  protected readonly valid = signal(true);
  protected readonly creating = signal(false);
  /** Why the draft could not be made, in the server's words (it has no Chrome, for one). */
  protected readonly refused = signal('');

  protected create(): void {
    if (this.creating() || !this.valid()) return;
    const m = this.model();
    this.creating.set(true);
    this.refused.set('');
    this.port
      .createDraftFromText({ manifest: String(m['manifest'] ?? ''), fragment: String(m['fragment'] ?? '') })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (d) => {
          this.creating.set(false);
          void this.router.navigate([this.link('parts', d.id)]);
        },
        // What the person wrote stays in the form.
        error: (e) => {
          this.creating.set(false);
          this.refused.set(failureText(e, this.texts));
        },
      });
  }
}
