import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PagedList } from '@lab/paged-list';
import { TicketService } from '@lab/server-connection';

import { LanguageService } from '../core/language';
import { textsFor } from '../core/texts';
import { InputsList } from '../shared/inputs-list/inputs-list';
import type { VideoEdit } from '../video-edit/model';
import type { Generation, VideoModel } from '../video/model';
import { EditCard } from './edit-card/edit-card';
import { mergeHistory, type HistoryItem } from './merge';

@Component({
  selector: 'app-history',
  templateUrl: './history.html',
  styleUrl: './history.scss',
  imports: [EditCard, InputsList, PagedList],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class History {
  readonly generations = input.required<readonly Generation[]>();
  /** The video edits, shown among the generations by the time they were asked for. */
  readonly edits = input<readonly VideoEdit[]>([]);
  /** The port's models, to show a model by its name; one that is no longer listed shows by its identifier. */
  readonly models = input<readonly VideoModel[]>([]);
  readonly open = output<Generation>();
  readonly repeat = output<Generation>();
  readonly remove = output<Generation>();
  readonly openEdit = output<VideoEdit>();
  readonly removeEdit = output<VideoEdit>();

  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly lang = inject(LanguageService).lang;
  protected readonly tickets = inject(TicketService);
  protected readonly items = computed(() => mergeHistory(this.generations(), this.edits()));
  /** The page the paged list hands over (its template context is untyped) as the history items it is made of. */
  protected readonly typed = (page: unknown): readonly HistoryItem[] => page as readonly HistoryItem[];
  private readonly names = computed(() => new Map(this.models().map((m) => [m.id, m.name])));

  protected modelName(g: Generation): string {
    return this.names().get(g.settings.model) ?? g.settings.model;
  }
}
