import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { RunEvents } from './run-events';

/** Only while busy is the server asked again, so the buttons come back as soon as the run ends. */
const POLL_BUSY_MS = 1000;
const BUSY_CLASS = 'app-busy';

/**
 * Only one process at a time: while a run is queued or running on the server,
 * or a local task (assistant, description, extraction) is in flight, every
 * button but the ones that cancel is dimmed and does nothing. When the busy
 * time ends a short chime tells so.
 *
 * Elements that stay usable: `[data-cancel]` (cancel buttons), `[data-keep]`,
 * the navigation rail, dialogs and the audio players.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly api = inject(ApiService);
  private readonly runEvents = inject(RunEvents);
  private readonly snack = inject(MatSnackBar);

  /** A run is queued or running on the server (any tab, any client). */
  private readonly serverBusy = signal(false);
  /** Local tasks in flight, by name. */
  private readonly local = signal<ReadonlySet<string>>(new Set());

  readonly busy = computed(() => this.serverBusy() || this.local().size > 0);

  private ctx?: AudioContext;
  private timer?: ReturnType<typeof setTimeout>;
  private wasBusy = false;

  constructor() {
    effect(() => {
      const busy = this.busy();
      untracked(() => {
        document.documentElement.classList.toggle(BUSY_CLASS, busy);
        if (this.wasBusy && !busy) this.chime();
        this.wasBusy = busy;
      });
    });
    // A run launched from here shows as busy before the next poll.
    effect(() => {
      if (this.api.launches() > 0) untracked(() => void this.poll());
    });
    // A run that ends frees the buttons at once, without waiting for the next poll.
    effect(() => {
      if (this.runEvents.ended() > 0) untracked(() => void this.poll());
    });
    // The first gesture unlocks the audio, so the chime can sound later.
    const unlock = () => {
      this.audio()?.resume().catch(() => undefined);
    };
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    // Captured before the components see it: a blocked button never reaches its handler.
    const onClick = (e: Event) => this.block(e);
    document.addEventListener('click', onClick, { capture: true });
    // Idle, the server is not polled: coming back to the tab looks for a run started elsewhere.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
      clearTimeout(this.timer);
      document.documentElement.classList.remove(BUSY_CLASS);
    });
    void this.poll();
  }

  /** Marks a local task as running (`on`) or finished; the name only has to be unique per task. */
  track(name: string, on: boolean): void {
    this.local.update((s) => {
      if (s.has(name) === on) return s;
      const next = new Set(s);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  private async poll(): Promise<void> {
    clearTimeout(this.timer);
    try {
      const runs = await firstValueFrom(this.api.listRuns(undefined, 20, true));
      this.serverBusy.set(runs.some((r) => r.state === 'queued' || r.state === 'running'));
    } catch {
      // Unreachable server: keep what we knew, try again.
    }
    if (this.serverBusy()) this.timer = setTimeout(() => void this.poll(), POLL_BUSY_MS);
  }

  private lastNote = 0;

  /** Says why nothing happened, at most every few seconds. */
  private explain(): void {
    const now = Date.now();
    if (now - this.lastNote < 3000) return;
    this.lastNote = now;
    this.snack.open($localize`:@@activity.wait:Wait until what is being generated finishes.`, undefined, { duration: 2500 });
  }

  private block(e: Event): void {
    if (!this.busy()) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest('button');
    if (!btn || (btn.closest(EXEMPT) && !btn.closest(START))) return;
    this.explain();
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  private audio(): AudioContext | undefined {
    try {
      this.ctx ??= new AudioContext();
    } catch {
      // No Web Audio: the chime is just skipped.
    }
    return this.ctx;
  }

  /** Two soft notes going up. */
  private chime(): void {
    const ctx = this.audio();
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    [659.25, 880].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      const t = t0 + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  }
}

/** Buttons that start work stay blocked even inside an exempt area (the composer, a request being reviewed). */
export const START = '[data-start]';

/** What stays clickable while something runs. */
export const EXEMPT = '[data-cancel], [data-keep], .rail, .cdk-overlay-container, app-audio-player';
