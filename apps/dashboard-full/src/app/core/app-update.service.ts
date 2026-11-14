import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** How often an app left open asks whether the server has a newer build. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * The installed app replaces itself when the server serves a new build: the worker downloads it in the
 * background, `ready` turns true and the shell offers "Update"; applying it reloads the page. Nothing is cleared:
 * the connection settings live in the browser's storage, which the update does not touch. Without a worker (a dev
 * server, an old browser, plain HTTP) nothing happens.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly sw = inject(SwUpdate, { optional: true });

  /** A newer build is downloaded and waits for the user's tap. */
  readonly ready = signal(false);
  private watching = false;

  /** Starts checking: now, when the app comes back to the front and every few hours. */
  watch(): void {
    if (this.watching || !this.sw?.isEnabled) return;
    this.watching = true;
    this.sw.versionUpdates.subscribe((e) => {
      if (e.type === 'VERSION_READY') this.ready.set(true);
    });
    void this.check();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.check();
    });
    setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  private async check(): Promise<void> {
    try {
      await this.sw?.checkForUpdate();
    } catch {
      // the server cannot be reached: the next check tries again
    }
  }

  /** Runs the new build. */
  async apply(): Promise<void> {
    try {
      await this.sw?.activateUpdate();
    } finally {
      location.reload();
    }
  }
}
