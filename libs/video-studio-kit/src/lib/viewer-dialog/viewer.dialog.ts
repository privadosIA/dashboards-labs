import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../core/language';
import { VIDEO_STUDIO_OPTIONS } from '../core/options';
import { textsFor } from '../core/texts';
import type { Generation } from '../video/model';
import { cssRatio } from '../shared/format';
import { InputsList } from '../shared/inputs-list/inputs-list';

export type ViewerAction = 'repeat' | 'remove';

@Component({
  selector: 'app-viewer-dialog',
  templateUrl: './viewer.dialog.html',
  styleUrl: './viewer.dialog.scss',
  imports: [InputsList],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewerDialog {
  protected readonly generation = inject<Generation>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ViewerDialog, ViewerAction>>(MatDialogRef);
  protected readonly t = textsFor(inject(LanguageService).lang);
  /** The in-memory adapters make no real video: only then does the studio say so. */
  protected readonly simulated = inject(VIDEO_STUDIO_OPTIONS, { optional: true })?.memory === true;
  protected readonly ratio = cssRatio(this.generation.settings.aspectRatio);
  /** Opens paused on a frame (`#t=0.1` makes the browser draw one) instead of on a black box; playing is up to the person. */
  private readonly tickets = inject(TicketService);
  protected readonly source = computed(() => `${this.tickets.withTicket(this.generation.videoUrl ?? '')}#t=0.1`);
  protected readonly download = computed(() => this.tickets.withTicket(this.generation.videoUrl ?? ''));

  protected close(action?: ViewerAction): void {
    this.ref.close(action);
  }
}
