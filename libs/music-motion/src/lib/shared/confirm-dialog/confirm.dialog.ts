import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** What a confirmation asks, in the words of the screen that opens it. */
export interface ConfirmData {
  readonly title: string;
  readonly message: string;
  /** The button that goes ahead. */
  readonly action: string;
  /** The action is one that cannot be undone: its button is the colour of danger. */
  readonly danger?: boolean;
}

/** Asks before going ahead. Closes with `true` to go ahead and `false` to stop. */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm.dialog.html',
  styleUrl: './confirm.dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  protected readonly ref = inject<MatDialogRef<ConfirmDialog, boolean>>(MatDialogRef);
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
  protected readonly cancel = textsFor(inject(LanguageService).lang).cancel;
}
