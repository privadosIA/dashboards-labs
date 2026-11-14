import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { Motion } from '../model';

/**
 * The motions of the library as cards: the preview (playing while the pointer or the focus is on it, and always on the
 * chosen one), the title, the tags, the duration and the people, and the state with the server's reason when it failed.
 * `select` offers to choose a ready motion (the Motion Control panel); `manage` offers to remove any (the library screen).
 */
@Component({
  selector: 'app-motion-cards',
  templateUrl: './motion-cards.html',
  styleUrl: './motion-cards.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MotionCards {
  readonly motions = input.required<readonly Motion[]>();
  readonly mode = input<'select' | 'manage'>('select');
  /** The id of the chosen motion, in `select` mode. */
  readonly chosen = input<string | null>(null);
  /** The id to choose, or null to give the choice up. */
  readonly choose = output<string | null>();
  readonly remove = output<Motion>();

  protected readonly tickets = inject(TicketService);
  protected readonly t = textsFor(inject(LanguageService).lang);

  protected people(n: number): string {
    return n === 1 ? this.t.motionLibrary.peopleOne : this.t.motionLibrary.peopleMany.replace('{n}', String(n));
  }

  protected seconds(n: number): string {
    return this.t.motionLibrary.seconds.replace('{n}', String(Math.round(n * 10) / 10));
  }

  protected play(video: HTMLVideoElement): void {
    try {
      void video.play()?.catch(() => undefined);
    } catch {
      // a browser that cannot play it just shows the first picture
    }
  }

  protected stop(video: HTMLVideoElement, keep: boolean): void {
    if (keep) return;
    try {
      video.pause();
    } catch {
      // nothing to stop
    }
  }
}
