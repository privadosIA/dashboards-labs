import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AppUpdateService } from '../../core/app-update.service';
import { ServerLinkService } from '../../core/server-link.service';

/** A strip above the content: the server cannot be reached (retry), or a new version of the app is ready (update). */
@Component({
  selector: 'app-status-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './status-banner.component.html',
  styleUrl: './status-banner.component.scss',
})
export class StatusBannerComponent {
  protected readonly link = inject(ServerLinkService);
  protected readonly update = inject(AppUpdateService);
}
