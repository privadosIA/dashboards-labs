import { Injectable, InjectionToken, inject, signal } from '@angular/core';

import { ConnectionService } from '@lab/server-connection';

/** The page that says the home server is off; the VPS in front of the dashboard serves it (and the build ships it). */
export const OBRAS_PATH = '/obras.html';

/** Where to go when the VPS says the server is off: `location.replace`, so Back does not bounce between the two pages. */
export const OBRAS_NAVIGATE = new InjectionToken<(path: string) => void>('OBRAS_NAVIGATE', {
  providedIn: 'root',
  factory: () => (path) => window.location.replace(path),
});

/**
 * Whether the server answers. The shell opens from the worker's copy even when it does not, so without this the
 * app would show empty screens; with it, the shell says the server cannot be reached and offers to retry.
 * `/api/health` needs no token, so a wrong token is not mistaken for a server that is down.
 */
@Injectable({ providedIn: 'root' })
export class ServerLinkService {
  private readonly conn = inject(ConnectionService);
  private readonly goToObras = inject(OBRAS_NAVIGATE);

  /** True until a check fails; the first check runs at start. */
  readonly reachable = signal(true);
  readonly checking = signal(false);
  private watching = false;

  async check(): Promise<void> {
    this.checking.set(true);
    try {
      const res = await fetch(`${this.conn.server()}/api/health`, { cache: 'no-store' });
      this.reachable.set(res.ok);
      // Only the VPS answers this exact way when the server at home is off; any other failure keeps the banner.
      if (!res.ok && res.status === 503 && (await isOfflineAnswer(res))) this.goToObras(OBRAS_PATH);
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

/** True for the body `{"error":"offline"}` that the VPS's nginx gives when it cannot reach the server at home. */
async function isOfflineAnswer(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { error?: unknown } | null;
    return body?.error === 'offline';
  } catch {
    return false;
  }
}
