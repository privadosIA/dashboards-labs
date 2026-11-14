import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ANIMATION } from '@lab/music-motion';
import { Subscription } from 'rxjs';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { execute, failureOf } from '../../execute';
import { FlowStore } from '../../flow.store';
import { reasonText } from '../../shared/reason-text';
import { type MapSummary, makeMap, transcribePiece } from '../../steps/map';

/** The Song map step: a piece is made from the song with the plan's choices and the prompt; the review shows the map and offers Transcribe when the words are only estimated. */
@Component({
  selector: 'app-map-card',
  templateUrl: './map-card.html',
  styleUrl: './map-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapCard implements OnInit {
  private readonly store = inject(FlowStore);
  private readonly animation = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).flow.map;
  protected readonly why = (reason?: string) => reasonText(this.lang, reason);

  protected readonly flow = this.store.flow;
  protected readonly step = computed(() => this.flow()?.steps.map);
  protected readonly summary = computed(() => this.step()?.result as MapSummary | undefined);
  protected readonly auto = computed(() => this.flow()?.autoContinue.map === true);
  protected readonly transcribing = signal(false);
  protected readonly transcribeError = signal('');
  protected readonly busy = signal(false);
  private running: Subscription | undefined;

  protected readonly sent = computed(() => {
    const f = this.flow();
    if (!f) return '';
    const c = f.plan.animation.choices;
    return this.t.sent(f.plan.song.title, c.style, c.level, c.fps, c.resolution);
  });

  ngOnInit(): void {
    if (this.step()?.status === 'pending') this.make();
  }

  protected make(): void {
    const flow = this.flow();
    const key = flow?.refs.libraryKey;
    if (!flow || !key) {
      this.store.run('map');
      this.store.fail('map', 'the song is not in the library');
      return;
    }
    this.running?.unsubscribe();
    this.running = execute(this.store, 'map', () => makeMap(this.animation, key, flow.plan, flow.prompt), { onBusy: (b) => this.busy.set(b) });
    this.destroyed.onDestroy(() => this.running?.unsubscribe());
  }

  protected transcribe(): void {
    const id = this.summary()?.pieceId;
    if (!id || this.transcribing()) return;
    this.transcribing.set(true);
    this.transcribeError.set('');
    transcribePiece(this.animation, id)
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: (summary) => {
          this.transcribing.set(false);
          this.store.setResult('map', { ...summary });
        },
        error: (e: unknown) => {
          this.transcribing.set(false);
          this.transcribeError.set(failureOf(e).reason);
        },
      });
  }

  protected setAuto(on: boolean): void {
    this.store.setAuto('map', on);
  }

  protected continue(): void {
    this.store.continue();
  }
}
