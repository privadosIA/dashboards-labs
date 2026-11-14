import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, effect, inject, input } from '@angular/core';

import { VECTOR_EDITOR_LANG } from '../provide-vector-editor';
import type { VectorStore } from '../store/vector-store';
import { vectorTexts } from '../texts';

/** What takes a Space for itself: a field, or a button (which a Space presses). */
const TAKES_SPACE = 'input, textarea, select, button, [contenteditable="true"], [role="slider"]';

/**
 * The transport: go to the start or the end, step a frame back or forward, play and pause, loop, and a frame rate of 30 or 60. While it plays
 * it moves the store's playhead by the time that went by between animation frames. Space plays or pauses when no field has the focus.
 */
@Component({
  selector: 'lab-vector-transport',
  templateUrl: './transport.html',
  styleUrl: './transport.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorTransport {
  readonly store = input.required<VectorStore>();

  protected readonly t = vectorTexts(inject(VECTOR_EDITOR_LANG));
  protected readonly playing = computed(() => this.store().playing());
  protected readonly loop = computed(() => this.store().loop());
  protected readonly fps = computed(() => this.store().doc().fps);
  protected readonly time = computed(() => {
    const doc = this.store().doc();
    const t = this.store().playhead();
    return `${t.toFixed(2)} / ${doc.duration.toFixed(2)} ${this.t.timeline.seconds} · ${Math.round(t * doc.fps)}`;
  });

  private last: number | undefined;
  private frame: number | undefined;

  constructor() {
    effect(() => {
      if (this.playing()) this.start();
      else this.stop();
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private start(): void {
    if (this.frame !== undefined || typeof requestAnimationFrame !== 'function') return;
    this.last = undefined;
    const run = (now: number): void => {
      this.tick(now);
      this.frame = this.store().playing() ? requestAnimationFrame(run) : undefined;
    };
    this.frame = requestAnimationFrame(run);
  }

  private stop(): void {
    if (this.frame !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.last = undefined;
  }

  /** Moves the playhead by the time since the last call (the first call only starts the clock). At the end it goes back to the start or pauses. */
  tick(now: number): void {
    const store = this.store();
    if (!store.playing()) return;
    const dt = this.last === undefined ? 0 : Math.max(0, (now - this.last) / 1000);
    this.last = now;
    const duration = store.doc().duration;
    const next = store.playhead() + dt;
    if (next < duration) store.playhead.set(next);
    else if (store.loop()) store.playhead.set(duration > 0 ? next % duration : 0);
    else {
      store.playhead.set(duration);
      store.pause();
    }
  }

  protected setFps(e: Event): void {
    const fps = Number((e.target as HTMLSelectElement).value) === 60 ? 60 : 30;
    this.store().apply((d) => ({ ...d, fps }));
  }

  @HostListener('document:keydown', ['$event'])
  protected space(e: KeyboardEvent): void {
    if (e.key !== ' ' || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(TAKES_SPACE)) return;
    e.preventDefault();
    this.store().togglePlay();
  }
}
