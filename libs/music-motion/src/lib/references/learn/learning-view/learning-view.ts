import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { LearnedItem, Learning } from '@lab/animation-core';
import { injectLink } from '../../../core/links';
import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';

/**
 * What a learning made: the styles it kept and the part drafts it proposed (each with its state now, whether it is different from what exists and the
 * closest thing that does), what it dropped as too similar and what it could not do. The same view serves the learning that is running and an old one.
 */
@Component({
  selector: 'app-learning-view',
  imports: [RouterLink],
  templateUrl: './learning-view.html',
  styleUrl: './learning-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearningView {
  readonly learning = input.required<Learning>();

  protected readonly link = injectLink();
  protected readonly t = textsFor(inject(LanguageService).lang).references.learn;

  protected exists(item: LearnedItem): boolean {
    return item.state !== 'gone';
  }

  protected stateText(item: LearnedItem): string {
    const states = this.t.states as Record<string, string>;
    return states[item.state] ?? item.state;
  }

  protected distance(n: number): string {
    return n.toFixed(2);
  }
}
