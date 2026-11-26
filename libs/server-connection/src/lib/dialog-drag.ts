import { DOCUMENT } from '@angular/common';
import type { DragRef } from '@angular/cdk/drag-drop';
import { Injectable, Injector, afterNextRender, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

/** Where a dialog is taken from: its title, in the order the dashboards draw them (Material's own, then a header, then a heading). */
const HANDLE = '[mat-dialog-title], [matDialogTitle], .mat-mdc-dialog-title, header, h1, h2';

/**
 * Every dialog of the dashboard can be moved by its title: press it and drag. It listens to the dialogs Material opens, so
 * none has to ask for it, and it stays inside the window. A dialog with no title is left where it opens.
 */
@Injectable({ providedIn: 'root' })
export class DialogDrag {
  private readonly dialog = inject(MatDialog);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  start(): void {
    // the container carries its id only after the next render, when the dialog is already on the page
    this.dialog.afterOpened.subscribe((ref) => afterNextRender(() => void this.attach(ref).catch(() => undefined), { injector: this.injector }));
  }

  private async attach(ref: MatDialogRef<unknown>): Promise<void> {
    const container = this.document.getElementById(ref.id);
    const pane = container?.closest<HTMLElement>('.cdk-overlay-pane');
    const handle = container?.querySelector<HTMLElement>(HANDLE);
    if (!container || !pane || !handle) return;
    handle.style.cursor = 'move';
    // the drag code is a chunk of its own: it is fetched the first time a dialog opens, not with the page
    const { DragDrop } = await import('@angular/cdk/drag-drop');
    // the dialog may have closed (or the page gone) while the chunk came: then there is nothing to move, and the failure is harmless
    if (!pane.isConnected) return;
    const drag: DragRef = this.injector.get(DragDrop).createDrag(pane).withHandles([handle]);
    const wrapper = pane.parentElement;
    if (wrapper) drag.withBoundaryElement(wrapper);
    ref.afterClosed().subscribe(() => drag.dispose());
  }
}
