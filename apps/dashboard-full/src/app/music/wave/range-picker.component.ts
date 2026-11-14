import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';

import { ApiService } from '../../core/api.service';
import { AudioPlayerComponent } from '../../shared/audio-player/audio-player.component';
import { MusicStore } from '../music.store';
import { beatGrid, beatSnapper } from './snap';
import { SongWaveComponent, WaveRange } from './song-wave.component';

/** Buckets of the waveform of the range picker (a list row draws fewer). */
const PICKER_BUCKETS = 1200;
/** How early the player of a heard range is stopped, so it does not run past its end. */
const STOP_TOLERANCE = 0.1;

/**
 * A song as a waveform on which a part is picked, with the player of that
 * song and a button to hear only the picked part. It is used by the repaint
 * task of a track and by the dialog that repaints a created song. The values
 * live in the parent: it reports the range and shows the one it is given.
 */
@Component({
  selector: 'app-range-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule, SongWaveComponent, AudioPlayerComponent],
  templateUrl: './range-picker.component.html',
  styleUrl: './range-picker.component.scss',
})
export class RangePickerComponent {
  /** The audio, relative to the project (`sources/x.mp3` or `out/<project>/x.mp3`). */
  readonly file = input.required<string>();
  /** Changes when the file is replaced under the same name (its hash or modification time). */
  readonly version = input<string | undefined>(undefined);
  /** The picked part in seconds; a missing start is the beginning and a missing end is the end of the song. */
  readonly start = input<number | undefined>(undefined);
  readonly end = input<number | undefined>(undefined);
  /** The tempo of the song, when known: the range can then snap to the beat. */
  readonly bpm = input<number | undefined>(undefined);
  readonly timesignature = input<string | undefined>(undefined);

  readonly rangeChange = output<WaveRange>();

  private readonly store = inject(MusicStore);
  private readonly api = inject(ApiService);
  private readonly player = viewChild<AudioPlayerComponent>('player');

  protected readonly peaks = computed(() => this.store.wave(this.file(), this.version(), PICKER_BUCKETS));
  protected readonly range = computed<WaveRange | null>(() => {
    const start = this.start();
    const end = this.end() ?? this.peaks()?.duration;
    if ((start === undefined && this.end() === undefined) || end === undefined) return null;
    return { start: Math.max(0, start ?? 0), end };
  });
  protected readonly url = computed(() => this.api.artifactUrl(this.store.projectId(), this.file()));
  protected readonly grid = computed(() => beatGrid(this.bpm(), this.timesignature()));
  protected readonly snapOn = signal(true);
  /** Where the first beat falls in the file; 0 until the server says. */
  private readonly phase = signal(0);
  protected readonly snap = computed(() => (this.snapOn() ? beatSnapper(this.grid(), this.phase()) : null));

  protected readonly position = signal(0);
  /** The end of the range being heard, or null when the song plays freely. */
  private heardUntil: number | null = null;

  constructor() {
    effect(() => this.store.loadWave(this.file(), this.version(), PICKER_BUCKETS));
    effect(() => {
      const bpm = this.grid()?.bpm;
      if (!bpm) return;
      void this.store.beatPhase(this.file(), bpm).then((p) => this.phase.set(p ?? 0));
    });
  }

  protected seek(t: number): void {
    this.heardUntil = null;
    this.position.set(t); // the player reports it too, but only once its file is loaded
    this.player()?.seek(t);
  }

  protected setPosition(t: number | null): void {
    const now = t ?? 0;
    this.position.set(now);
    if (this.heardUntil !== null && now >= this.heardUntil - STOP_TOLERANCE) {
      this.heardUntil = null;
      this.player()?.pause();
    }
  }

  /** Plays from the start of the range to its end. */
  protected hear(): void {
    const r = this.range();
    const player = this.player();
    if (!r || !player) return;
    const length = this.peaks()?.duration;
    this.heardUntil = length ? Math.min(r.end, length) : r.end;
    player.seek(Math.max(0, r.start));
    player.play();
  }
}
