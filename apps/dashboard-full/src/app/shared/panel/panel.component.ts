import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A titled section: heading, optional description and optional actions in its
 * header (projected with `moPanelActions`), then its body. One padding, one
 * radius, one border for every section of the app.
 */
@Component({
  selector: 'mo-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.scss',
})
export class PanelComponent {
  readonly heading = input.required<string>();
  readonly description = input<string>();
}
