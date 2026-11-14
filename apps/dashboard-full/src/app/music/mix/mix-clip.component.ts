import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { MixClip, PeaksResponse } from '../../core/api.models';
import { SongWaveComponent } from '../wave/song-wave.component';
import { anchorOffset, nudgeStep, snapAnchored, snapTo } from '../wave/snap';
import { MIN_CLIP_SECONDS, usedRange } from './mix-utils';

/** What a trim handle changed: the bar moves with its left edge so the sound stays where it was. */
export interface ClipTrim {
  start?: number;
  trim_start?: number;
  trim_end?: number;
}

/**
 * One clip as a bar on the timeline: its width is the used part of the audio,
 * its waveform is drawn in SVG from the server's peaks, a drag moves it in
 * time (horizontal only) and the two handles trim it. The arrow keys move it
 * by a grid step. It only reports what the user did; the parent edits the project.
 */
@Component({
  selector: 'app-mix-clip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDrag, MatIconModule, SongWaveComponent],
  templateUrl: './mix-clip.component.html',
  styleUrl: './mix-clip.component.scss',
  host: {
    class: 'clip',
    role: 'button',
    tabindex: '0',
    '[class.clip--selected]': 'selected()',
    '[class.clip--muted]': 'clip().mute',
    '[class.clip--unreadable]': 'peaks() === null',
    '[style.left.px]': 'left()',
    '[style.width.px]': 'width()',
    '[attr.aria-pressed]': 'selected()',
    '[attr.aria-label]': 'ariaLabel()',
    '(keydown)': 'onKey($event)',
    '(click)': 'picked.emit()',
  },
})
export class MixClipComponent {
  readonly clip = input.required<MixClip>();
  readonly label = input.required<string>();
  /** undefined while loading, null when the audio cannot be read (a track that was not created yet). */
  readonly peaks = input<PeaksResponse | null | undefined>(undefined);
  readonly pxPerSecond = input.required<number>();
  /** Grid step in seconds; 0 is free. */
  readonly snap = input(1);
  /**
   * Second of the song (in its file) where its first beat falls, when the grid
   * follows the beat: the clip then snaps so that this point, not its start,
   * lands on the grid. 0 snaps the start.
   */
  readonly anchor = input(0);
  /**
   * Seconds between the beats of the song, when `anchor` is where its pulse
   * falls (under one beat): the clip then anchors on the first beat it still
   * plays. 0 means `anchor` is the very second to anchor on.
   */
  readonly period = input(0);
  readonly selected = input(false);

  readonly picked = output<void>();
  readonly moved = output<number>();
  readonly trimmed = output<ClipTrim>();

  protected readonly duration = computed(() => this.peaks()?.duration ?? null);
  protected readonly range = computed(() => usedRange(this.clip(), this.duration()));
  protected readonly start = computed(() => this.clip().start ?? 0);
  protected readonly left = computed(() => this.start() * this.pxPerSecond());
  protected readonly width = computed(() => Math.max(8, this.range().used * this.pxPerSecond()));

  protected readonly ariaLabel = computed(
    () => $localize`:@@mix.clipAria:${this.label()}:label:, starts at second ${Math.round(this.start() * 10) / 10}:start:`,
  );

  protected onMoved(e: CdkDragEnd): void {
    e.source.reset();
    this.moved.emit(this.snapped(this.start() + e.distance.x / this.pxPerSecond()));
  }

  /** The start nearest to `raw` that puts the anchor (when the clip still plays it) on the grid, never before 0. */
  private snapped(raw: number): number {
    const offset = anchorOffset(this.range().from, this.anchor(), this.period());
    return snapAnchored(raw, this.snap(), offset);
  }

  protected onTrimStart(e: CdkDragEnd): void {
    e.source.reset();
    const { from, to } = this.range();
    const next = Math.min(Math.max(0, from + e.distance.x / this.pxPerSecond()), to - MIN_CLIP_SECONDS);
    const delta = next - from;
    if (Math.abs(delta) < 0.005) return;
    const trim = Math.round(next * 1000) / 1000;
    this.trimmed.emit({ trim_start: trim > 0.004 ? trim : undefined, start: Math.max(0, Math.round((this.start() + delta) * 1000) / 1000) });
  }

  protected onTrimEnd(e: CdkDragEnd): void {
    e.source.reset();
    const { from, to } = this.range();
    const max = this.duration();
    let next = Math.max(to + e.distance.x / this.pxPerSecond(), from + MIN_CLIP_SECONDS);
    if (max != null) next = Math.min(next, max);
    if (Math.abs(next - to) < 0.005) return;
    const atEnd = max != null && Math.abs(max - next) < 0.01;
    this.trimmed.emit({ trim_end: atEnd ? undefined : Math.round(next * 1000) / 1000 });
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = nudgeStep(this.snap(), e.shiftKey) * (e.key === 'ArrowLeft' ? -1 : 1);
      this.moved.emit(Math.max(0, snapTo(this.start() + step, this.snap() > 0 ? this.snap() : 0.1)));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.picked.emit();
    }
  }
}
