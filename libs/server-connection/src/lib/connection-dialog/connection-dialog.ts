import { ChangeDetectionStrategy, Component, InjectionToken, inject, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { ConnectionService, normalizeServer } from '../connection.service';
import { SERVER_CONNECTION_LANG } from '../provide-server-connection';
import { connectionTexts } from '../texts';

export type ProbeResult = 'idle' | 'testing' | 'ok' | 'unauthorized' | 'unreachable';

/** Reloads the page; replaced in specs. Settings that change start the page clean, as nothing loaded from the old server stays. */
export const CONNECTION_RELOAD = new InjectionToken<() => void>('CONNECTION_RELOAD', {
  providedIn: 'root',
  factory: () => () => location.reload(),
});

/**
 * The Server connection box: which server the dashboard talks to and the access token. Test connection checks both before
 * they are saved, with a plain `fetch` so a failed test is not mistaken for a failed call of the dashboard.
 */
@Component({
  selector: 'lab-connection-dialog',
  templateUrl: './connection-dialog.html',
  styleUrl: './connection-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionDialog {
  private readonly connection = inject(ConnectionService);
  protected readonly ref = inject<MatDialogRef<ConnectionDialog, boolean>>(MatDialogRef);
  private readonly reload = inject(CONNECTION_RELOAD);
  protected readonly t = connectionTexts(inject(SERVER_CONNECTION_LANG));

  protected readonly server = signal(this.connection.server());
  protected readonly token = signal(this.connection.token());
  protected readonly remember = signal(this.connection.remember());
  protected readonly probe = signal<ProbeResult>('idle');

  protected typed(field: 'server' | 'token', event: Event): void {
    this[field].set((event.target as HTMLInputElement).value);
    this.probe.set('idle');
  }

  protected async test(): Promise<void> {
    this.probe.set('testing');
    const headers: Record<string, string> = this.token() ? { Authorization: `Bearer ${this.token()}` } : {};
    try {
      const res = await fetch(`${normalizeServer(this.server())}/api/environment`, { headers, signal: AbortSignal.timeout(5000) });
      this.probe.set(res.status === 401 ? 'unauthorized' : res.ok ? 'ok' : 'unreachable');
    } catch {
      this.probe.set('unreachable');
    }
  }

  protected save(): void {
    const changed = this.connection.save({ server: this.server(), token: this.token() }, this.remember());
    this.ref.close(true);
    if (changed) this.reload();
  }
}
