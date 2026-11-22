import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** A fixed strip at the top of the public demo: the data is simulated and nothing in it is real. It cannot be closed. */
@Component({
  selector: 'app-demo-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  templateUrl: './demo-notice.component.html',
  styleUrl: './demo-notice.component.scss',
})
export class DemoNoticeComponent {}
