import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { VIDEO_TOOLS } from '../../edit-tools/registry';
import type { VideoEdit } from '../../video-edit/model';

/** The body of the history card of a video edit: its tool, settings, progress or error, and what it made. */
@Component({
  selector: 'app-edit-card',
  templateUrl: './edit-card.html',
  styleUrl: './edit-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-state]': 'edit().state' },
})
export class EditCard {
  readonly edit = input.required<VideoEdit>();
  readonly open = output<VideoEdit>();
  readonly remove = output<VideoEdit>();

  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly tickets = inject(TicketService);
  protected readonly name = computed(() => VIDEO_TOOLS[this.edit().tool]?.name(this.t) ?? this.edit().tool);
  /** The settings worth a pill: the prompt is long and has its own line. */
  protected readonly pills = computed(() =>
    Object.entries(this.edit().settings)
      .filter(([key]) => key !== 'prompt')
      .map(([key, value]) => `${key}: ${value}`),
  );
  protected readonly prompt = computed(() => String(this.edit().settings['prompt'] ?? ''));
  protected readonly size = computed(() => {
    const r = this.edit().result;
    return r?.width && r.height ? `${r.width}×${r.height}` : '';
  });
}
