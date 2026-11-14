import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';
import { forkJoin } from 'rxjs';

import { injectLink } from '../core/links';
import { AnimationFailure, type Catalog, type Preset } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { failureText } from '../shared/failure-text';
import en from './dynamic/preset.en.json';
import es from './dynamic/preset.es.json';
import { fromModel, presetFieldOf, toModel } from './preset-model';
import { withPresetCatalog } from './with-preset-catalog';

type FormModel = Record<string, unknown>;

/** One style: its name, design, rhythm and parts to edit, and what had to be adjusted of the video's colours when it was made. */
@Component({
  selector: 'app-preset-page',
  imports: [DynamicFormComponent, DfSlotDirective, RouterLink],
  templateUrl: './preset.page.html',
  styleUrl: './preset.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresetPage implements OnInit {
  protected readonly link = injectLink();
  private readonly port = inject(ANIMATION);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.presets;
  protected readonly common = this.texts;
  private readonly base = pickSchema('preset', { en, es }, this.lang);

  /** `undefined` while it loads, `null` when it does not exist or could not be read (`error` says which). */
  protected readonly preset = signal<Preset | null | undefined>(undefined);
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly error = signal('');
  protected readonly schema = computed(() => withPresetCatalog(this.base, this.catalog(), this.texts));
  protected readonly model = signal<FormModel>({});
  protected readonly valid = signal(true);
  protected readonly working = signal(false);
  protected readonly done = signal(false);
  /** Why the server refused, in its own words; it starts with the field it is about. */
  protected readonly refused = signal('');
  private readonly field = computed(() => presetFieldOf(this.refused()));
  protected readonly rhythmProblem = computed(() => (this.field() === 'rhythm' ? this.refused() : ''));
  protected readonly accentProblem = computed(() => (this.field() === 'accent' ? this.refused() : ''));
  protected readonly partsProblem = computed(() => (this.field() === 'parts' ? this.refused() : ''));
  protected readonly otherProblem = computed(() => (this.refused() && !this.rhythmProblem() && !this.accentProblem() && !this.partsProblem() ? this.refused() : ''));

  ngOnInit(): void {
    forkJoin({ preset: this.port.preset(this.id), catalog: this.port.catalog() })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: ({ preset, catalog }) => {
          this.catalog.set(catalog);
          this.preset.set(preset);
          this.model.set(toModel(preset));
        },
        error: (e) => {
          this.error.set(e instanceof AnimationFailure && e.kind === 'missing' ? '' : failureText(e, this.texts));
          this.preset.set(null);
        },
      });
  }

  protected save(): void {
    const preset = this.preset();
    if (!preset || this.working() || !this.valid()) return;
    this.working.set(true);
    this.done.set(false);
    this.refused.set('');
    this.port
      .savePreset(this.id, fromModel(this.model(), preset))
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (saved) => {
          this.working.set(false);
          this.done.set(true);
          this.preset.set(saved);
        },
        error: (e) => {
          this.working.set(false);
          // The server's own words, which start with the field they are about; anything else gets our sentence first.
          this.refused.set(e instanceof AnimationFailure ? e.reason : failureText(e, this.texts));
        },
      });
  }
}
