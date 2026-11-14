import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { VIDEO_TOOLS } from '../edit-tools/registry';
import type { VideoEdit } from '../video-edit/model';

export type EditViewerAction = 'remove';

/** Plays what a video edit made, with its download and its removal. */
@Component({
  selector: 'app-edit-viewer-dialog',
  templateUrl: './edit-viewer.dialog.html',
  styleUrl: './edit-viewer.dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditViewerDialog {
  protected readonly edit = inject<VideoEdit>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<EditViewerDialog, EditViewerAction>>(MatDialogRef);
  protected readonly t = textsFor(inject(LanguageService).lang);
  private readonly tickets = inject(TicketService);
  protected readonly name = VIDEO_TOOLS[this.edit.tool]?.name(this.t) ?? this.edit.tool;
  protected readonly ratio = this.edit.result?.width && this.edit.result.height ? `${this.edit.result.width} / ${this.edit.result.height}` : '16 / 9';
  /** Opens paused on a frame (`#t=0.1` makes the browser draw one) instead of on a black box. */
  protected readonly source = computed(() => `${this.tickets.withTicket(this.edit.result?.video ?? '')}#t=0.1`);
  protected readonly download = computed(() => this.tickets.withTicket(this.edit.result?.video ?? ''));

  protected close(action?: EditViewerAction): void {
    this.ref.close(action);
  }
}
