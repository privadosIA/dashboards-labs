import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, model, signal, untracked } from '@angular/core';
import { type Subscription } from 'rxjs';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import type { KindDef } from '../../kinds/kinds';
import { type EngineCard, type EnginesView, preselected } from '../model';
import { ENGINES } from '../port';

/**
 * What this server can run for a kind, read at the moment: music generators with Start for a stopped service, video options with availability, sound and time, installed image models
 * with the history's time per picture, whether Chrome is there for graphics, the catalog's choices for the animated piece. The card chosen is `selected` (two-way); an engine this machine
 * cannot run is shown with its reason and cannot be chosen, and the first usable one is preselected.
 */
@Component({
  selector: 'lab-engines-panel',
  templateUrl: './engines-panel.html',
  styleUrl: './engines-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnginesPanel {
  private readonly port = inject(ENGINES);
  private readonly destroyed = inject(DestroyRef);
  private readonly all = textsFor(inject(LanguageService).lang);
  protected readonly t = this.all.engines;
  protected readonly retry = this.all.retry;

  readonly kind = input.required<KindDef>();
  /** The id of the chosen engine or model (empty when the kind has none to choose). */
  readonly selected = model('');
  /** How often a service that is starting is asked about again (milliseconds). */
  readonly pollMs = input(3000);

  protected readonly view = signal<EnginesView | null>(null);
  protected readonly loading = signal(true);
  protected readonly problem = signal('');
  /** The service a Start is in flight for, and why the last one failed. */
  protected readonly starting = signal('');
  protected readonly startProblem = signal('');
  private current: Subscription | null = null;
  private poll: ReturnType<typeof setTimeout> | null = null;
  private polls = 0;

  constructor() {
    effect(() => {
      const kind = this.kind();
      untracked(() => this.load(kind));
    });
    this.destroyed.onDestroy(() => {
      this.current?.unsubscribe();
      if (this.poll) clearTimeout(this.poll);
    });
  }

  private load(kind: KindDef, polling = false): void {
    this.current?.unsubscribe();
    if (this.poll) clearTimeout(this.poll);
    if (!polling) this.polls = 0;
    // A poll refreshes in place: the cards stay on the screen.
    if (!polling) {
      this.loading.set(true);
      this.view.set(null);
    }
    this.problem.set('');
    if (!polling) this.startProblem.set('');
    this.current = this.port.load(kind.engines).subscribe({
      next: (view) => {
        this.view.set(view);
        this.loading.set(false);
        const cards = 'cards' in view ? view.cards : [];
        if (cards.length && !cards.some((c) => c.id === this.selected() && c.state === 'ready')) this.selected.set(preselected(cards));
        if (!cards.length) this.selected.set('');
        // A service that is starting takes a while: ask again until it is up (or for about ten minutes).
        if (cards.some((c) => c.state === 'starting') && this.polls < 200) {
          this.polls += 1;
          this.poll = setTimeout(() => this.load(this.kind(), true), this.pollMs());
        }
      },
      error: (e: unknown) => {
        this.loading.set(false);
        this.problem.set(e instanceof Error ? e.message : String(e));
      },
    });
  }

  protected reload(): void {
    this.load(this.kind());
  }

  protected choose(card: EngineCard): void {
    if (card.state === 'ready') this.selected.set(card.id);
  }

  /** The server's reason in words when the kit knows it, else as the server wrote it. */
  protected why(card: EngineCard): string {
    return card.reason ? (this.t.reasons[card.reason] ?? card.reason) : '';
  }

  protected stateLabel(card: EngineCard): string {
    return this.t[card.state];
  }

  protected start(card: EngineCard): void {
    this.starting.set(card.id);
    this.startProblem.set('');
    this.port.startMusic(card.id).subscribe({
      next: () => {
        this.starting.set('');
        this.reload();
      },
      error: (e: unknown) => {
        this.starting.set('');
        this.startProblem.set(this.t.startFailed(e instanceof Error ? e.message : String(e)));
      },
    });
  }

  protected note(): string {
    const id = this.kind().id;
    return id === 'video' ? this.t.videoNote : id === 'images' ? this.t.imagesNote : id === 'songs' ? this.t.songsNote : id === 'graphics' ? this.t.graphicsNote : '';
  }
}
