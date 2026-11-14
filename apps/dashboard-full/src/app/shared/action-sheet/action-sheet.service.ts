import { Injectable, inject } from '@angular/core';
import { MatBottomSheet, MatBottomSheetRef } from '@angular/material/bottom-sheet';

import { BackEntry, pushBackEntry } from '../../core/back-entry';
import { ActionSheetComponent, SheetAction } from './action-sheet.component';

/**
 * Opens a bottom sheet with a list of actions. It closes with a tap outside, a swipe down (Material's) or the
 * device's back gesture, and choosing a row closes it and runs the action. One at a time: a sheet opened while
 * another is still going away takes its place (choosing in one sheet often opens the next).
 */
@Injectable({ providedIn: 'root' })
export class ActionSheetService {
  private readonly sheet = inject(MatBottomSheet);
  private ref: MatBottomSheetRef<ActionSheetComponent> | null = null;
  private entry: BackEntry | null = null;

  open(title: string | undefined, actions: SheetAction[]): void {
    const previous = this.ref;
    const ref = this.sheet.open(ActionSheetComponent, { data: { title, actions }, panelClass: 'mo-sheet' });
    this.ref = ref;
    if (previous) {
      // The history entry of the first one serves the new one.
      this.entry?.retarget(() => ref.dismiss());
      previous.dismiss();
    } else {
      this.entry = pushBackEntry(() => ref.dismiss());
    }
    ref.afterDismissed().subscribe(() => {
      if (this.ref !== ref) return; // replaced: the new one owns the entry
      this.entry?.leave();
      this.entry = null;
      this.ref = null;
    });
  }

  /** Closes the open sheet, if any. */
  close(): void {
    this.ref?.dismiss();
  }
}
