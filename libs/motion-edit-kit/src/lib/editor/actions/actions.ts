import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { buildAnimationExport } from '@lab/animation-dataset';
import { isBusy, isProposing, type PieceDetail } from '@lab/animation-core';
import { ANIMATION } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { datasetFileName, saveText } from './save-text';

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** What can be done with a piece from here: take its dataset out as a file, and ask the server to draw it. Neither changes the piece. */
@Component({
  selector: 'app-actions',
  templateUrl: './actions.html',
  styleUrl: './actions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Actions {
  readonly piece = input.required<PieceDetail>();
  /** The server took the render: the page follows the piece from here. */
  readonly started = output<void>();

  private readonly port = inject(ANIMATION);
  private readonly tickets = inject(TicketService);
  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.actions;

  protected readonly exporting = signal(false);
  protected readonly saved = signal('');
  protected readonly exportRefused = signal('');
  protected readonly starting = signal(false);
  protected readonly renderRefused = signal('');

  protected readonly busy = computed(() => isBusy(this.piece()) || isProposing(this.piece()));
  protected readonly estimate = computed(() => this.t.estimate(clock(this.piece().estimate.seconds), this.piece().estimate.frames));
  protected readonly video = computed(() => (this.piece().state === 'done' && this.piece().video ? this.tickets.withTicket(this.piece().video!) : null));

  protected async export(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.saved.set('');
    this.exportRefused.set('');
    try {
      const file = await buildAnimationExport(this.port, this.piece().id, () => undefined);
      const name = datasetFileName(this.piece().title);
      saveText(name, JSON.stringify(file, null, 2));
      this.saved.set(this.t.exported(name));
    } catch (e) {
      this.exportRefused.set(`${this.t.exportFailed} ${this.reason(e)}`);
    } finally {
      this.exporting.set(false);
    }
  }

  protected async render(): Promise<void> {
    if (this.starting() || this.busy()) return;
    this.starting.set(true);
    this.renderRefused.set('');
    try {
      await firstValueFrom(this.port.render(this.piece().id));
      this.started.emit();
    } catch (e) {
      this.renderRefused.set(`${this.t.renderFailed} ${this.reason(e)}`);
    } finally {
      this.starting.set(false);
    }
  }

  private reason(e: unknown): string {
    return e instanceof Error ? e.message : this.texts.unknownError;
  }
}
