import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The opening of every page: its title, one line saying what it is for and,
 * on the right, the page's primary action (projected with `moActions`). It is
 * the page's `h1`; the top bar no longer repeats the title.
 */
@Component({
  selector: 'mo-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}
