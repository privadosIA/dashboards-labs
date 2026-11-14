import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { map, Observable } from 'rxjs';

export interface ConfirmDialogData {
  title: string;
  /** Says exactly what will happen / be removed. */
  message: string;
  /** The button says what it does ("Borrar proyecto", never "Aceptar"). */
  confirmLabel: string;
  destructive?: boolean;
  /** An unchecked checkbox offered next to the message (see openConfirmWithOption). */
  option?: string;
}

export interface ConfirmWithOption {
  confirmed: boolean;
  option: boolean;
}

/**
 * Destructive confirmations (spec: project-workspace). The message names
 * what is removed; the confirm button states the action.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatCheckboxModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  protected readonly option = signal(false);
}

/** Opens the confirm dialog; emits true only on explicit confirmation. */
export function openConfirm(dialog: MatDialog, data: ConfirmDialogData): Observable<boolean> {
  return dialog
    .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      data,
      autoFocus: 'first-tabbable',
    })
    .afterClosed()
    .pipe() as Observable<boolean>;
}

/** Like openConfirm, with the optional checkbox of `data.option`. */
export function openConfirmWithOption(
  dialog: MatDialog,
  data: ConfirmDialogData,
): Observable<ConfirmWithOption> {
  return dialog
    .open<ConfirmDialogComponent, ConfirmDialogData, boolean | ConfirmWithOption>(
      ConfirmDialogComponent,
      { data, autoFocus: 'first-tabbable' },
    )
    .afterClosed()
    .pipe(
      map((r) =>
        r && typeof r === 'object' ? r : { confirmed: r === true, option: false },
      ),
    );
}
