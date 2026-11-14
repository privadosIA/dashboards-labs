import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** The card on top of the Create tab: the model in use and a way to change it. The picture is a gradient of the tokens, not an image. */
@Component({
  selector: 'app-header-card',
  templateUrl: './header-card.html',
  styleUrl: './header-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderCard {
  readonly model = input<string>('');
  /** What the model is, shown as a tooltip when the pointer rests on the card. */
  readonly description = input<string>('');
  readonly changed = output<void>();

  protected readonly t = textsFor(inject(LanguageService).lang);
}
