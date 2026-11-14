import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * A long explanation kept out of the way: a small ⓘ that shows it in a bubble on hover or focus. The text is also its accessible name, so a screen reader reads it
 * and a keyboard reaches it (it is a button that does nothing when pressed).
 */
@Component({
  selector: 'app-info-tip',
  templateUrl: './info-tip.html',
  styleUrl: './info-tip.scss',
  imports: [MatTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoTip {
  readonly text = input.required<string>();
}
