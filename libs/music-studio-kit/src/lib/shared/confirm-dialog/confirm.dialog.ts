import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm.dialog.html',
  styleUrl: './confirm.dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  protected readonly ref = inject<MatDialogRef<ConfirmDialog, boolean>>(MatDialogRef);
  protected readonly t = textsFor(inject(LanguageService).lang);
}
