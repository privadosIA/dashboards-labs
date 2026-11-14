import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DfSlotDirective, DynamicFormComponent } from '@core/dynamic-forms';
import { pickSchema } from '@lab/forms-kit';

import { AnimationFailure, isBusy, isProposing, type Catalog, type PieceDetail } from '@lab/animation-core';
import { ANIMATION } from '../../animation/tokens';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { failureText } from '../../shared/failure-text';
import { LOCK_KEY } from '../../shared/lock';
import { fieldOf, fromModel, sectionTags, toModel } from './design-model';
import en from './dynamic/design-form.en.json';
import es from './dynamic/design-form.es.json';
import { ConceptBox } from './concept-box/concept-box';
import { withDesignCatalog } from './with-design-catalog';

type FormModel = Record<string, unknown>;

/** The design of a piece: colours, typefaces, the mode of each section and the concept, saved through the server. */
@Component({
  selector: 'app-design-form',
  imports: [ConceptBox, DynamicFormComponent, DfSlotDirective],
  templateUrl: './design-form.html',
  styleUrl: './design-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignForm {
  readonly piece = input.required<PieceDetail>();
  readonly catalog = input.required<Catalog | null>();
  /** The piece as the server holds it after the design was saved. */
  readonly saved = output<PieceDetail>();

  private readonly port = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.design;
  private readonly base = pickSchema('design-form', { en, es }, inject(LanguageService).lang);

  private readonly tags = computed(() => sectionTags(this.piece()));
  protected readonly locked = computed(() => isBusy(this.piece()) || isProposing(this.piece()));
  protected readonly schema = computed(() => withDesignCatalog(this.base, this.catalog(), this.tags(), this.t));
  protected readonly model = signal<FormModel>({});
  /** The idea of the design, written in its own box under the form (it is not a field of the form). */
  protected readonly concept = signal('');
  protected readonly valid = signal(false);
  protected readonly working = signal(false);
  protected readonly done = signal(false);
  /** Why the server refused the design, in its own words. */
  protected readonly refused = signal('');
  protected readonly accentProblem = computed(() => (fieldOf(this.refused()) === 'accent' ? this.refused() : ''));
  protected readonly otherProblem = computed(() => (this.accentProblem() ? '' : this.refused()));
  protected readonly origin = computed(() => (this.piece().design.edited ? this.t.origin.user : this.t.origin[this.piece().design.source]));
  /** The colours the form holds now, shown as swatches. A text that is not a colour is left out. */
  protected readonly swatches = computed(() => {
    const m = this.model();
    return (['dark', 'light', 'accent'] as const).map((k) => ({ key: k, value: String(m[k] ?? '') })).filter((s) => /^#[0-9a-fA-F]{6}$/.test(s.value));
  });

  constructor() {
    // The form starts from the piece's design, and again whenever the piece changes (a proposal replaced it).
    effect(() => {
      const piece = this.piece();
      const tags = this.tags();
      untracked(() => {
        const model = { ...toModel(piece.design.design, tags), [LOCK_KEY]: this.locked() };
        this.model.set(model);
        this.concept.set(String(piece.design.design.concept ?? ''));
      });
    });
    effect(() => {
      const locked = this.locked();
      untracked(() => this.model.update((m) => (m[LOCK_KEY] === locked ? m : { ...m, [LOCK_KEY]: locked })));
    });
  }

  protected setConcept(concept: string): void {
    this.concept.set(concept);
  }

  protected save(): void {
    if (this.working() || this.locked() || !this.valid()) return;
    this.working.set(true);
    this.refused.set('');
    this.done.set(false);
    this.port
      .saveDesign(this.piece().id, fromModel({ ...this.model(), concept: this.concept() }, this.tags()))
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (piece) => {
          this.working.set(false);
          this.done.set(true);
          this.saved.emit(piece);
        },
        error: (e) => {
          this.working.set(false);
          // The server's own words, which start with the field they are about; anything else gets our sentence first.
          this.refused.set(e instanceof AnimationFailure ? e.reason : failureText(e, this.texts));
        },
      });
  }
}
