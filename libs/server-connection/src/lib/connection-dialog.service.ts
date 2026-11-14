import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

import { ConnectionDialog } from './connection-dialog/connection-dialog';

/** Opens the connection box from anywhere (the button, a call that answered 401). One at a time. */
@Injectable({ providedIn: 'root' })
export class ConnectionDialogService {
  private readonly dialog = inject(MatDialog);
  private ref: MatDialogRef<ConnectionDialog, boolean> | null = null;

  open(): void {
    if (this.ref) return;
    this.ref = this.dialog.open(ConnectionDialog, { autoFocus: 'first-tabbable' });
    this.ref.afterClosed().subscribe(() => (this.ref = null));
  }

  /** A call of the dashboard answered 401: the person can correct the token. */
  unauthorized(): void {
    this.open();
  }
}
