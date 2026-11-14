import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { GenerationInput } from '../../video/model';

/** The files a generation used, in order: a thumbnail for each image and the kind with the name for a video or an audio. Shared by the history and the viewer. */
@Component({
  selector: 'app-inputs-list',
  templateUrl: './inputs-list.html',
  styleUrl: './inputs-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputsList {
  readonly inputs = input<readonly GenerationInput[]>([]);

  protected readonly t = textsFor(inject(LanguageService).lang);
  private readonly tickets = inject(TicketService);

  protected isImage(i: GenerationInput): boolean {
    return i.kind === 'start_image' || i.kind === 'end_image' || i.kind === 'reference_image';
  }

  /** An image's address as the page can open it (with its ticket when there is a token); a name with no address has none. */
  protected src(i: GenerationInput): string | null {
    return i.url ? this.tickets.withTicket(i.url) : null;
  }
}
