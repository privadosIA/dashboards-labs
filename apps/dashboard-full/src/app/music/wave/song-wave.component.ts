import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';

import { PeaksResponse } from '../../core/api.models';

/** The part of a song that is picked, in seconds. */
export interface WaveRange {
  start: number;
  end: number;
}

/** The shortest range a drag or a key leaves, seconds. */
export const MIN_RANGE_SECONDS = 0.1;
const CLICK_PIXELS = 4;

/** The SVG path of the peaks of `from` to `to` seconds, one vertical bar each, in a viewBox of (bars x 100); null when there is nothing to draw. */
export function wavePath(p: PeaksResponse | null | undefined, from = 0, to = Infinity): { d: string; width: number } | null {
  if (!p || p.peaks.length === 0 || p.duration <= 0) return null;
  const per = p.duration / p.peaks.length;
  const a = Math.max(0, Math.floor(from / per));
  const b = Math.min(p.peaks.length, Math.max(a + 1, Math.ceil(to / per)));
  const parts: string[] = [];
  for (let i = a; i < b; i++) {
    const h = Math.max(0.02, p.peaks[i]) * 46;
    parts.push(`M${i - a + 0.5} ${50 - h}V${50 + h}`);
  }
  return { d: parts.join(''), width: b - a };
}

const tenth = (s: number) => Math.round(s * 10) / 10;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type Drag = { kind: 'new' | 'start' | 'end'; at: number; x: number; moved: boolean };

/**
 * The waveform of an audio file as one SVG path, stretched to its box, from the
 * peaks the server gives. Alone it is a decoration (the mixer draws a clip's
 * used part with it). With `seekable` a click moves the playhead; with
 * `editable` a drag picks a range whose two ends are handles that also answer
 * the arrow keys. It reports what the user did; the parent keeps the values.
 */
@Component({
  selector: 'app-song-wave',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './song-wave.component.html',
  styleUrl: './song-wave.component.scss',
  host: {
    '[class.wave--interactive]': 'interactive()',
    '[attr.role]': "interactive() && wave() ? 'group' : null",
    '[attr.aria-label]': 'ariaLabel()',
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'drag.set(null); live.set(null)',
  },
})
export class SongWaveComponent {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly peaks = input<PeaksResponse | null | undefined>(undefined);
  /** The part of the file that is drawn, seconds; the whole file by default. */
  readonly from = input(0);
  readonly to = input(Infinity);
  /** Second of the song the player is at; the part before it is drawn apart. */
  readonly position = input(0);
  /** The picked range; an end past the song's length is drawn as reaching the end. */
  readonly range = input<WaveRange | null>(null);
  readonly seekable = input(false);
  readonly editable = input(false);
  /** Rounds a second to the grid (the second argument says the bar was asked for); null is free. */
  readonly snap = input<((t: number, bar: boolean) => number) | null>(null);

  readonly seek = output<number>();
  readonly rangeChange = output<WaveRange>();

  protected readonly drag = signal<Drag | null>(null);
  protected readonly live = signal<WaveRange | null>(null);

  protected readonly wave = computed(() => wavePath(this.peaks(), this.from(), this.to()));
  protected readonly interactive = computed(() => this.seekable() || this.editable());
  protected readonly duration = computed(() => this.peaks()?.duration ?? 0);
  private readonly start = computed(() => Math.max(0, this.from()));
  private readonly span = computed(() => Math.max(0.001, Math.min(this.to(), this.duration()) - this.start()));

  protected readonly shown = computed(() => this.live() ?? this.range());
  protected readonly over = computed(() => (this.shown()?.end ?? 0) > this.duration() + 0.05);
  protected readonly startPct = computed(() => this.pct(this.shown()?.start ?? 0));
  protected readonly endPct = computed(() => this.pct(this.shown()?.end ?? 0));
  protected readonly headPct = computed(() => this.pct(this.position()));

  protected readonly ariaLabel = computed(() => {
    if (!this.interactive() || !this.wave()) return null;
    const r = this.shown();
    const length = clock(this.duration());
    return r
      ? $localize`:@@songWave.aria.range:Waveform of ${length}:length:, part from ${tenth(r.start)}:start: to ${tenth(r.end)}:end: seconds`
      : $localize`:@@songWave.aria:Waveform of ${length}:length:`;
  });

  protected pct(t: number): number {
    return Math.min(100, Math.max(0, ((t - this.start()) / this.span()) * 100));
  }

  protected valueText(t: number): string {
    return $localize`:@@songWave.seconds:${tenth(t)}:seconds: s`;
  }

  /** The second under a pointer, snapped when there is a grid. */
  private timeAt(e: MouseEvent): number {
    const rect = this.el.nativeElement.getBoundingClientRect();
    const frac = rect.width > 0 ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0;
    const t = this.start() + frac * this.span();
    const snap = this.snap();
    return snap ? snap(t, e.altKey) : t;
  }

  protected onDown(e: PointerEvent): void {
    if (!this.interactive() || !this.wave() || e.button > 0) return;
    const at = this.timeAt(e);
    this.drag.set({ kind: 'new', at, x: e.clientX, moved: false });
    this.capture(e);
  }

  protected onHandleDown(kind: 'start' | 'end', e: PointerEvent): void {
    if (!this.editable() || e.button > 0) return;
    e.stopPropagation();
    this.drag.set({ kind, at: this.timeAt(e), x: e.clientX, moved: true });
    this.capture(e);
  }

  private capture(e: PointerEvent): void {
    this.el.nativeElement.setPointerCapture?.(e.pointerId);
  }

  protected onMove(e: PointerEvent): void {
    const d = this.drag();
    if (!d) return;
    const t = Math.min(this.duration(), Math.max(0, this.timeAt(e)));
    if (d.kind === 'new') {
      if (!this.editable()) return;
      if (!d.moved && Math.abs(e.clientX - d.x) < CLICK_PIXELS) return;
      this.drag.set({ ...d, moved: true });
      this.live.set({ start: Math.min(d.at, t), end: Math.max(d.at, t) });
      return;
    }
    const r = this.range();
    if (!r) return;
    this.live.set(d.kind === 'start' ? { start: Math.min(t, r.end - MIN_RANGE_SECONDS), end: r.end } : { start: r.start, end: Math.max(t, r.start + MIN_RANGE_SECONDS) });
  }

  protected onUp(e: PointerEvent): void {
    const d = this.drag();
    if (!d) return;
    this.drag.set(null);
    this.el.nativeElement.releasePointerCapture?.(e.pointerId);
    const r = this.live();
    this.live.set(null);
    if (d.kind === 'new' && !d.moved) {
      this.seek.emit(tenth(Math.min(this.duration(), Math.max(0, d.at))));
    } else if (r) {
      this.emitRange(r);
    }
  }

  private emitRange(r: WaveRange): void {
    const start = tenth(r.start);
    const end = tenth(r.end);
    const now = this.range();
    if (now && now.start === start && now.end === end) return; // a key against the other end changes nothing
    if (end - start >= MIN_RANGE_SECONDS - 1e-9) this.rangeChange.emit({ start, end });
  }

  protected onHandleKey(kind: 'start' | 'end', e: KeyboardEvent): void {
    const r = this.range();
    if (!r || !this.editable()) return;
    const step = e.shiftKey ? 1 : 0.1;
    let v = kind === 'start' ? r.start : r.end;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += step;
    else if (e.key === 'Home') v = kind === 'start' ? 0 : r.start + MIN_RANGE_SECONDS;
    else if (e.key === 'End') v = kind === 'start' ? r.end - MIN_RANGE_SECONDS : this.duration();
    else return;
    e.preventDefault();
    this.emitRange(
      kind === 'start'
        ? { start: Math.min(Math.max(0, v), r.end - MIN_RANGE_SECONDS), end: r.end }
        : { start: r.start, end: Math.max(Math.min(v, this.duration()), r.start + MIN_RANGE_SECONDS) },
    );
  }
}
