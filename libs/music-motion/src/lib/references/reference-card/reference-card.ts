import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import type { Reference } from '@lab/animation-core';
import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** One reference in the list: its title, tags and state, and open and delete. */
@Component({
  selector: 'app-reference-card',
  templateUrl: './reference-card.html',
  styleUrl: './reference-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferenceCard {
  readonly reference = input.required<Reference>();
  /** What the newest learning of the reference kept, when it has one. */
  readonly taught = input<{ readonly styles: number; readonly parts: number } | null>(null);
  readonly open = output<Reference>();
  readonly remove = output<Reference>();

  protected readonly t = textsFor(inject(LanguageService).lang).references;
}
