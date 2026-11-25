import { Injectable, inject } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';

import { ModelViewerDialog, type ViewerData } from './model-viewer/model-viewer';

/** Opens the viewer on a model, in a dialog: the whole screen on a phone and a large window elsewhere. The focus goes back to where it was opened from when it closes. */
@Injectable({ providedIn: 'root' })
export class ModelViewer {
  private readonly dialog = inject(MatDialog);

  open(target: ViewerData): MatDialogRef<ModelViewerDialog> {
    const phone = globalThis.matchMedia?.('(max-width: 47.99rem)').matches ?? false;
    return this.dialog.open(ModelViewerDialog, {
      data: target,
      width: phone ? '100vw' : 'min(64rem, 96vw)',
      maxWidth: '100vw',
      height: phone ? '100dvh' : 'min(44rem, 92dvh)',
      maxHeight: '100dvh',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }
}
