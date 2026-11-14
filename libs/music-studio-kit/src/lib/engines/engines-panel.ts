import { Injectable, inject } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';

import { EnginesDialog } from './engines-dialog/engines-dialog';

const ID = 'engines';

/** Opens the Engines panel; there is one at a time, so a second press (or the link of another dialog) shows the one already open. */
@Injectable({ providedIn: 'root' })
export class EnginesPanel {
  private readonly dialog = inject(MatDialog);

  open(): MatDialogRef<EnginesDialog> {
    return (this.dialog.getDialogById(ID) as MatDialogRef<EnginesDialog> | undefined) ?? this.dialog.open(EnginesDialog, { id: ID });
  }
}
