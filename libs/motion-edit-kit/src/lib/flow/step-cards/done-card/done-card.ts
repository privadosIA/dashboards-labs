import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { buildAnimationExport } from '@lab/animation-dataset';
import { ANIMATION } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../../../core/language';
import { MOTION_EDIT_BASE } from '../../../core/options';
import { textsFor } from '../../../core/texts';
import { datasetFileName, saveText } from '../../../editor/actions/save-text';
import { FlowStore } from '../../flow.store';

/** The last card: the video, Export dataset, Open the piece, New flow from this one (same plan, new run) and the earlier attempts. */
@Component({
  selector: 'app-done-card',
  imports: [RouterLink],
  templateUrl: './done-card.html',
  styleUrl: './done-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DoneCard {
  private readonly store = inject(FlowStore);
  private readonly animation = inject(ANIMATION);
  private readonly tickets = inject(TicketService);
  private readonly router = inject(Router);
  private readonly base = inject(MOTION_EDIT_BASE);
  protected readonly t = textsFor(inject(LanguageService).lang).flow.done;

  protected readonly flow = this.store.flow;
  protected readonly video = computed(() => {
    const v = (this.flow()?.steps.render.result as { video?: string } | undefined)?.video;
    return v ? this.tickets.withTicket(v) : null;
  });
  protected readonly pieceLink = computed(() => [`${this.base}/pieces`, this.flow()?.refs.pieceId ?? '']);
  protected readonly attempts = computed(() => this.flow()?.attempts ?? []);
  protected readonly exporting = signal(false);
  protected readonly saved = signal('');
  protected readonly exportError = signal('');

  protected pieceOf(id: string): string[] {
    return [`${this.base}/pieces`, id];
  }

  /** Takes the piece's dataset out as a file, as the editor does. */
  protected async exportDataset(): Promise<void> {
    const id = this.flow()?.refs.pieceId;
    if (!id || this.exporting()) return;
    this.exporting.set(true);
    this.saved.set('');
    this.exportError.set('');
    try {
      const file = await buildAnimationExport(this.animation, id, () => undefined);
      const name = datasetFileName(this.flow()?.plan.song.title ?? 'animation');
      saveText(name, JSON.stringify(file, null, 2));
      this.saved.set(this.t.exported(name));
    } catch (e) {
      this.exportError.set(this.t.exportFailed(e instanceof Error ? e.message : String(e)));
    } finally {
      this.exporting.set(false);
    }
  }

  /** The same plan and prompt, a new run: it starts as its own flow. */
  protected newFlow(): void {
    const flow = this.flow();
    if (!flow) return;
    const fresh = this.store.startFrom(flow);
    void this.router.navigate([`${this.base}/flow`, fresh.id]);
  }
}
