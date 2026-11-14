import { computed, signal } from '@angular/core';

/** What the clock needs of the browser, so a test can drive it by hand. */
export interface ClockScheduler {
  request(cb: () => void): number;
  cancel(id: number): void;
  /** Milliseconds, only used for differences. */
  now(): number;
}

export const BROWSER_SCHEDULER: ClockScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
};

/** The part of an `HTMLAudioElement` the clock uses. */
export interface ClockAudio {
  currentTime: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'error', listener: () => void): void;
  removeEventListener(type: 'error', listener: () => void): void;
  src: string;
}

export interface ClockOptions {
  readonly scheduler?: ClockScheduler;
  /** Asks for a fresh address of the audio (a new ticket) when it fails; used once per failure. */
  readonly refresh?: () => Promise<string>;
}

/** Where a time falls on the grid of frames of a piece: rounded down, so what is seen is a frame the server would draw. */
export const quantise = (t: number, fps: number): number => (fps > 0 ? Math.floor(t * fps + 1e-6) / fps : t);

/**
 * The preview's clock: the time of the song (`time`), whether it runs, the frame rate and the length. With audio, the time is the audio
 * element's time on every animation frame, so sound and picture stay together; without, it runs on the browser's own clock and the
 * transport says there is no audio. Seeking moves both. It never goes past the end: it pauses there.
 */
export class PreviewClock {
  readonly time = signal(0);
  readonly playing = signal(false);
  readonly fps = signal(30);
  readonly duration = signal(0);
  readonly snapToFrames = signal(false);
  readonly hasAudio = signal(false);
  /** The time to send to the frame: the clock's time, rounded down to the frame grid when asked. */
  readonly shown = computed(() => (this.snapToFrames() ? quantise(this.time(), this.fps()) : this.time()));

  private audio: ClockAudio | null = null;
  private frame: number | undefined;
  private last = 0;
  private refreshed = false;
  private readonly scheduler: ClockScheduler;
  private readonly refresh?: () => Promise<string>;
  private readonly onError = (): void => void this.recover();

  constructor(options: ClockOptions = {}) {
    this.scheduler = options.scheduler ?? BROWSER_SCHEDULER;
    this.refresh = options.refresh;
  }

  /** Sets the length and frame rate of the piece and, optionally, the audio element of its song. */
  configure(duration: number, fps: number, audio: ClockAudio | null = this.audio): void {
    this.duration.set(Math.max(0, duration));
    this.fps.set(fps > 0 ? fps : 30);
    if (audio !== this.audio) {
      this.audio?.removeEventListener('error', this.onError);
      this.audio = audio;
      this.refreshed = false;
      audio?.addEventListener('error', this.onError);
    }
    this.hasAudio.set(audio !== null);
  }

  play(): void {
    if (this.playing()) return;
    if (this.time() >= this.duration() && this.duration() > 0) this.seek(0);
    this.playing.set(true);
    this.last = this.scheduler.now();
    if (this.audio) {
      this.audio.currentTime = this.time();
      void this.audio.play().catch(() => this.dropAudio());
    }
    this.loop();
  }

  pause(): void {
    if (!this.playing()) return;
    this.playing.set(false);
    if (this.frame !== undefined) this.scheduler.cancel(this.frame);
    this.frame = undefined;
    this.audio?.pause();
  }

  toggle(): void {
    if (this.playing()) this.pause();
    else this.play();
  }

  seek(t: number): void {
    const to = Math.min(Math.max(0, t), this.duration() > 0 ? this.duration() : Math.max(0, t));
    this.time.set(to);
    if (this.audio) this.audio.currentTime = to;
    this.last = this.scheduler.now();
  }

  /** One frame of the piece's rate forward (`1`) or back (`-1`); the clock stops there. */
  step(direction: 1 | -1): void {
    this.pause();
    this.seek(this.time() + direction / this.fps());
  }

  /** Moves by seconds, keeping the running state (Shift and the arrows). */
  nudge(seconds: number): void {
    this.seek(this.time() + seconds);
  }

  destroy(): void {
    this.pause();
    this.audio?.removeEventListener('error', this.onError);
    this.audio = null;
  }

  private loop(): void {
    this.frame = this.scheduler.request(() => {
      this.frame = undefined;
      if (!this.playing()) return;
      const now = this.scheduler.now();
      const t = this.audio ? this.audio.currentTime : this.time() + (now - this.last) / 1000;
      this.last = now;
      if (this.duration() > 0 && t >= this.duration()) {
        this.time.set(this.duration());
        this.pause();
        return;
      }
      this.time.set(t);
      this.loop();
    });
  }

  /** The audio failed to play: ask once for a new address (a new ticket) and go on; if that fails too, run without audio. */
  private async recover(): Promise<void> {
    const audio = this.audio;
    if (!audio) return;
    if (this.refresh && !this.refreshed) {
      this.refreshed = true;
      try {
        audio.src = await this.refresh();
        audio.currentTime = this.time();
        if (this.playing()) await audio.play();
        return;
      } catch {
        // falls through to running without audio
      }
    }
    this.dropAudio();
  }

  private dropAudio(): void {
    this.audio?.removeEventListener('error', this.onError);
    this.audio = null;
    this.hasAudio.set(false);
    this.last = this.scheduler.now();
  }
}
