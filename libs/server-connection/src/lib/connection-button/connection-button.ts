import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ConnectionDialogService } from '../connection-dialog.service';
import { ConnectionService } from '../connection.service';
import { SERVER_CONNECTION_LANG } from '../provide-server-connection';
import { connectionTexts } from '../texts';

/** The Connection button of a dashboard's header: the server in use, and a click opens the connection box. */
@Component({
  selector: 'lab-connection-button',
  templateUrl: './connection-button.html',
  styleUrl: './connection-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionButton {
  private readonly connection = inject(ConnectionService);
  private readonly dialog = inject(ConnectionDialogService);
  protected readonly t = connectionTexts(inject(SERVER_CONNECTION_LANG));
  protected readonly where = computed(() => this.connection.server() || this.t.button.thisServer);

  protected open(): void {
    this.dialog.open();
  }
}
