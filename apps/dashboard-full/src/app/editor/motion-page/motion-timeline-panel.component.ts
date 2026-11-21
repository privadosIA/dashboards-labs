import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import {
  TIMELINE_CURVES,
  TIMELINE_STEP,
  Timeline,
  TimelineHistory,
  TimelineProp,
  TimelineTrack,
  clampValue,
  placeTrack,
  snap,
  trackProps,
} from './motion-timeline';

type DragMode = 'move' | 'resize';

interface Drag {
  id: string;
  mode: DragMode;
  x0: number;
  start0: number;
  duration0: number;
  scale: number; // seconds per pixel
  before: Timeline;
  moved: boolean;
}

/**
 * The timeline of a motion-graphic page as one row per track: a bar over the time axis (drag it to move the
 * start, drag its right edge to change the duration), a playhead that follows the preview, and fields for
 * the numbers. Every change is reported with the whole new timeline; the panel keeps its own undo and redo.
 * It never asks the model for anything.
 */
@Component({
  selector: 'app-motion-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './motion-timeline-panel.component.html',
  styleUrl: './motion-timeline-panel.component.scss',
})
export class MotionTimelinePanelComponent {
  /** The timeline as stored; a new one (after saving, or a new page) restarts the panel. */
  readonly timeline = input.required<Timeline>();
  /** The length of the clip in seconds: the time axis goes from 0 to it. */
  readonly duration = input.required<number>();
  /** The preview's time, for the playhead. */
  readonly time = input(0);
  /** The whole timeline after an edit. */
  readonly changed = output<Timeline>();
  /** The user clicked the axis: the preview should go there. */
  readonly seekTo = output<number>();

  protected readonly curves = TIMELINE_CURVES;
  protected readonly step = TIMELINE_STEP;
  protected readonly tl = signal<Timeline>({ version: 1, tracks: [] });
  protected readonly selected = signal('');
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  protected readonly ticks = computed(() => {
    const total = Math.max(0, Math.floor(this.duration()));
    return Array.from({ length: total + 1 }, (_, i) => i);
  });
  protected readonly current = computed(() => this.tl().tracks.find((t) => t.id === this.selected()) ?? null);

  private readonly history = new TimelineHistory();
  private drag: Drag | null = null;
  private scrub: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const incoming = this.timeline();
      untracked(() => {
        const copy = structuredClone(incoming);
        this.tl.set(copy);
        this.history.clear();
        this.syncHistory();
        if (!copy.tracks.some((t) => t.id === this.selected())) this.selected.set(copy.tracks[0]?.id ?? '');
      });
    });
  }

  protected props(track: TimelineTrack): TimelineProp[] {
    return trackProps(track);
  }

  protected label(track: TimelineTrack): string {
    return track.label || track.id;
  }

  protected left(track: TimelineTrack): number {
    return this.percent(track.start);
  }

  protected width(track: TimelineTrack): number {
    return Math.max(0.5, this.percent(track.duration));
  }

  protected playhead(): number {
    return Math.min(100, Math.max(0, this.percent(this.time())));
  }

  protected easeValue(track: TimelineTrack): string {
    return Array.isArray(track.ease) ? 'custom' : (track.ease ?? 'out');
  }

  private percent(seconds: number): number {
    const total = this.duration();
    return total > 0 ? (seconds / total) * 100 : 0;
  }

  // --- edits -----------------------------------------------------------------

  /** Applies an edit to a copy of the timeline, remembers the previous state for undo and reports the result. */
  private edit(fn: (next: Timeline) => void): void {
    const before = structuredClone(this.tl());
    const next = structuredClone(before);
    fn(next);
    if (JSON.stringify(next) === JSON.stringify(before)) return;
    this.history.push(before);
    this.commit(next);
  }

  private commit(next: Timeline): void {
    this.tl.set(next);
    this.syncHistory();
    this.changed.emit(next);
  }

  private syncHistory(): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
  }

  protected setNumber(id: string, field: 'start' | 'duration' | 'stagger', raw: string): void {
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return;
    this.edit((tl) => {
      const t = tl.tracks.find((x) => x.id === id);
      if (!t) return;
      if (field === 'stagger') {
        if (v <= 0) delete t.stagger;
        else t.stagger = snap(v);
        return;
      }
      const placed = placeTrack(t, field === 'start' ? v : t.start, field === 'duration' ? v : t.duration, this.duration());
      t.start = placed.start;
      t.duration = placed.duration;
    });
  }

  protected setEase(id: string, value: string): void {
    if (value === 'custom') return;
    this.edit((tl) => {
      const t = tl.tracks.find((x) => x.id === id);
      if (t) t.ease = value;
    });
  }

  protected setValue(id: string, side: 'from' | 'to', prop: TimelineProp, raw: string): void {
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return;
    this.edit((tl) => {
      const t = tl.tracks.find((x) => x.id === id);
      if (t) t[side][prop] = clampValue(prop, v);
    });
  }

  protected undo(): void {
    const back = this.history.undo(this.tl());
    if (back) this.commit(back);
  }

  protected redo(): void {
    const again = this.history.redo(this.tl());
    if (again) this.commit(again);
  }

  // --- dragging a bar --------------------------------------------------------

  protected beginDrag(ev: PointerEvent, track: TimelineTrack, mode: DragMode, axis: HTMLElement): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.selected.set(track.id);
    const width = axis.getBoundingClientRect().width || 1;
    this.drag = {
      id: track.id, mode, x0: ev.clientX, start0: track.start, duration0: track.duration,
      scale: this.duration() / width, before: structuredClone(this.tl()), moved: false,
    };
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
  }

  protected dragTo(ev: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const dt = (ev.clientX - d.x0) * d.scale;
    const next = structuredClone(d.before);
    const t = next.tracks.find((x) => x.id === d.id);
    if (!t) return;
    const placed = d.mode === 'move' ? placeTrack(t, d.start0 + dt, d.duration0, this.duration()) : placeTrack(t, d.start0, d.duration0 + dt, this.duration());
    t.start = placed.start;
    t.duration = placed.duration;
    if (JSON.stringify(next) === JSON.stringify(this.tl())) return;
    if (!d.moved) {
      d.moved = true;
      this.history.push(d.before); // one undo step for the whole drag
    }
    this.commit(next);
  }

  protected endDrag(): void {
    this.drag = null;
  }

  /** Arrow keys on a bar: the start by one step (ten with shift); with alt the duration instead. */
  protected nudgeBar(ev: KeyboardEvent, track: TimelineTrack): void {
    const dir = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    ev.preventDefault();
    this.selected.set(track.id);
    const delta = dir * TIMELINE_STEP * (ev.shiftKey ? 10 : 1);
    this.edit((next) => {
      const t = next.tracks.find((x) => x.id === track.id);
      if (!t) return;
      const placed = ev.altKey ? placeTrack(t, t.start, t.duration + delta, this.duration()) : placeTrack(t, t.start + delta, t.duration, this.duration());
      t.start = placed.start;
      t.duration = placed.duration;
    });
  }

  /** Arrow keys on the playhead: the preview's time by one step, ten with shift, inside the clip. */
  protected nudgePlayhead(ev: KeyboardEvent): void {
    const dir = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    ev.preventDefault();
    const t = this.time() + dir * TIMELINE_STEP * (ev.shiftKey ? 10 : 1);
    this.seekTo.emit(Math.round(Math.min(this.duration(), Math.max(0, t)) * 100) / 100);
  }

  /** Grabs the playhead (the red bar) or the ruler: from then on the pointer sets the preview's time. */
  protected beginScrub(ev: PointerEvent, axis: HTMLElement): void {
    ev.preventDefault();
    ev.stopPropagation();
    this.scrub = axis;
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    this.scrubTo(ev);
  }

  protected scrubMove(ev: PointerEvent): void {
    if (this.scrub) this.scrubTo(ev);
  }

  protected endScrub(): void {
    this.scrub = null;
  }

  private scrubTo(ev: PointerEvent): void {
    const axis = this.scrub;
    if (!axis) return;
    const rect = axis.getBoundingClientRect();
    if (rect.width <= 0) return;
    const t = ((ev.clientX - rect.left) / rect.width) * this.duration();
    this.seekTo.emit(Math.round(Math.min(this.duration(), Math.max(0, t)) * 100) / 100);
  }

  protected seekFromAxis(ev: MouseEvent, axis: HTMLElement): void {
    const rect = axis.getBoundingClientRect();
    if (rect.width <= 0) return;
    this.seekTo.emit(Math.min(this.duration(), Math.max(0, ((ev.clientX - rect.left) / rect.width) * this.duration())));
  }
}
