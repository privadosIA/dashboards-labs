import { Injectable, inject, signal } from '@angular/core';

import { ConnectionService } from '@lab/server-connection';

/**
 * Whether the server answers. The shell opens from the worker's copy even when it does not, so without this the
 * app would show empty screens; with it, the shell says the server cannot be reached and offers to retry.
 * `/api/health` needs no token, so a wrong token is not mistaken for a server that is down.
 */
@Injectable({ providedIn: 'root' })
export class ServerLinkService {
  private readonly conn = inject(ConnectionService);

  /** True until a check fails; the first check runs at start. */
  readonly reachable = signal(true);
  readonly checking = signal(false);
  private watching = false;

  async check(): Promise<void> {
    this.checking.set(true);
    try {
      const res = await fetch(`${this.conn.server()}/api/health`, { cache: 'no-store' });
      this.reachable.set(res.ok);
    } catch {
      this.reachable.set(false);
    } finally {
      this.checking.set(false);
    }
  }

  /** Checks now, when the app comes back to the front and when the device goes on or off line. */
  watch(): void {
    if (this.watching || typeof window === 'undefined') return;
    this.watching = true;
    void this.check();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.check();
    });
    window.addEventListener('online', () => void this.check());
    window.addEventListener('offline', () => this.reachable.set(false));
  }
}
