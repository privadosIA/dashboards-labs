import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';

/** A labelled slider with its value beside it: the control of a bounded number (intensity, grain, strength). */
@Component({
  selector: 'mo-slider-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatSliderModule],
  templateUrl: './slider-field.component.html',
  styleUrl: './slider-field.component.scss',
})
export class SliderFieldComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly min = input(0);
  readonly max = input(1);
  readonly step = input(0.05);
  /** Lands on the slider's input, for tests and end-to-end checks. */
  readonly testId = input<string>();

  readonly valueChange = output<number>();
}
