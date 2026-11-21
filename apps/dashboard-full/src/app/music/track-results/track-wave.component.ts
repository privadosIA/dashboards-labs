import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output } from '@angular/core';

import { MusicManifestEntry } from '../../core/api.models';
import { MusicStore } from '../music.store';
import { SongWaveComponent } from '../wave/song-wave.component';

/**
 * The waveform of one exported song: it asks the store for the peaks when it
 * scrolls into view (so a project with hundreds of songs draws the visible
 * ones), follows the position of the song's player and reports a click as the
 * second to play from. A song whose peaks cannot be read shows nothing.
 */
@Component({
  selector: 'app-track-wave',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SongWaveComponent],
  templateUrl: './track-wave.component.html',
  styleUrl: './track-wave.component.scss',
  host: { '[class.track-wave--unreadable]': 'peaks() === null' },
})
export class TrackWaveComponent {
  readonly entry = input.required<MusicManifestEntry>();
  /** Seconds into the song while it plays. */
  readonly position = input(0);
  readonly seek = output<number>();

  private readonly store = inject(MusicStore);
  protected readonly peaks = computed(() => this.store.wave(this.entry().file, this.entry().sha256));

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const ask = () => this.store.loadWave(this.entry().file, this.entry().sha256);
    let seen: IntersectionObserver | undefined;
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return ask();
      seen = new IntersectionObserver((hits) => {
        if (!hits.some((h) => h.isIntersecting)) return;
        ask();
        seen?.disconnect();
      });
      seen.observe(host);
    });
    inject(DestroyRef).onDestroy(() => seen?.disconnect());
  }
}
