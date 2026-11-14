import { Injectable } from '@angular/core';

/**
 * Keeps a single song playing at a time: when a player starts, the one that
 * was playing is paused. Players report with `started`/`stopped`; the service
 * never owns an element, so a destroyed player simply reports `stopped`.
 */
@Injectable({ providedIn: 'root' })
export class AudioPlayerService {
  private current: HTMLMediaElement | null = null;
  /** For a player made of several elements (the mixer's preview): how to stop it. */
  private currentStop: (() => void) | null = null;

  started(el: HTMLMediaElement): void {
    if (this.current && this.current !== el) {
      this.current.pause();
    }
    this.runStop();
    this.current = el;
  }

  /** A player that is not one element takes the turn; `stop` is called when another one starts. */
  claim(stop: () => void): void {
    if (this.current) this.current.pause();
    this.current = null;
    this.runStop();
    this.currentStop = stop;
  }

  /** The player that claimed the turn is done. */
  release(stop: () => void): void {
    if (this.currentStop === stop) this.currentStop = null;
  }

  stopped(el: HTMLMediaElement): void {
    if (this.current === el) {
      this.current = null;
    }
  }

  private runStop(): void {
    const stop = this.currentStop;
    this.currentStop = null;
    stop?.();
  }
}
