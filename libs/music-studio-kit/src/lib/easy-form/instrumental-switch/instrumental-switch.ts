import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** The Instrumental card: its name and what it means on the left, a switch on the right. */
@Component({
  selector: 'app-instrumental-switch',
  templateUrl: './instrumental-switch.html',
  styleUrl: './instrumental-switch.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentalSwitch {
  readonly checked = input.required<boolean>();
  readonly checkedChange = output<boolean>();
  protected readonly t = textsFor(inject(LanguageService).lang);
}
