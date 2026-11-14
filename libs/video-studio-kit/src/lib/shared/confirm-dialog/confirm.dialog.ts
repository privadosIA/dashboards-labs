import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/** What to ask when it is not about deleting a generation. */
export interface ConfirmText {
  title: string;
  message: string;
}

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm.dialog.html',
  styleUrl: './confirm.dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  protected readonly ref = inject<MatDialogRef<ConfirmDialog, boolean>>(MatDialogRef);
  protected readonly t = textsFor(inject(LanguageService).lang);
  /** The title and the message of what is asked; a generation's own when none is given. */
  protected readonly ask: ConfirmText = inject<ConfirmText | null>(MAT_DIALOG_DATA, { optional: true }) ?? this.t.confirm;
}
