import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { MusicTagCombo } from '../../core/api.models';

/** The popular combinations of style tags as one-tap buttons: a first choice for whoever does not know the words. */
@Component({
  selector: 'app-combo-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  templateUrl: './combo-chips.component.html',
  styleUrl: './combo-chips.component.scss',
})
export class ComboChipsComponent {
  readonly combos = input<MusicTagCombo[]>([]);
  readonly picked = output<MusicTagCombo>();
}
