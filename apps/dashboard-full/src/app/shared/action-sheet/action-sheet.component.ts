import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';

/** One row of a sheet: what it does and how it looks. */
export interface SheetAction {
  icon?: string;
  label: string;
  /** What is chosen right now (the check mark of a list of options). */
  selected?: boolean;
  disabled?: boolean;
  /** Marks the row in tests. */
  testId?: string;
  /** Destructive: drawn with the error colour. */
  danger?: boolean;
  run: () => void;
}

export interface ActionSheetData {
  title?: string;
  actions: SheetAction[];
}

/** The content of a bottom sheet: a title and a list of actions, each at least 48 px tall. */
@Component({
  selector: 'app-action-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatListModule, MatIconModule],
  templateUrl: './action-sheet.component.html',
  styleUrl: './action-sheet.component.scss',
})
export class ActionSheetComponent {
  protected readonly data = inject<ActionSheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly ref = inject<MatBottomSheetRef<ActionSheetComponent>>(MatBottomSheetRef);

  protected choose(action: SheetAction): void {
    if (action.disabled) return;
    this.ref.dismiss();
    action.run();
  }
}
