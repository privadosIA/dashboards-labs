import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { demoNoticeTexts, type DemoNoticeLang } from '../texts';

/**
 * A strip at the top of a dashboard of the examples site: the data is simulated, it is a simplified example and not a final version,
 * and it is based on third-party work. It cannot be closed. A dashboard shows it only in its `examples` build.
 */
@Component({
  selector: 'lab-demo-notice',
  templateUrl: './demo-notice.html',
  styleUrl: './demo-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoNotice {
  /** The dashboard's language. */
  readonly lang = input.required<DemoNoticeLang>();
  protected readonly t = computed(() => demoNoticeTexts(this.lang()));
}
