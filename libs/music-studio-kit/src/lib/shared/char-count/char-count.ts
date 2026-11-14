import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The `12/80` under a text box: the form library draws none with the Material theme, so the forms put this in a slot. */
@Component({
  selector: 'app-char-count',
  templateUrl: './char-count.html',
  styleUrl: './char-count.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharCount {
  readonly length = input.required<number>();
  readonly max = input.required<number>();
}
