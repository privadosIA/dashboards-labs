import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { WriteRequest, Written } from './model';
import { AssistFailed } from './port';
import { SONGS } from './tokens';

/** Why the assistant could not write: its own reasons, or `unknown` for anything else. */
export type WriteError = AssistFailed['kind'] | 'unknown';

/** Asks the assistant for the lyrics and the style and keeps what the screen shows while it works: busy, and why it failed. */
@Injectable({ providedIn: 'root' })
export class SongWriter {
  private readonly port = inject(SONGS);
  readonly busy = signal(false);
  readonly error = signal<WriteError | null>(null);

  /** Forgets the reason of the last failure (a dialog opens clean). */
  clearError(): void {
    this.error.set(null);
  }

  /** What the assistant wrote, or null (and `error` says why). One call at a time: a second one while busy returns null. */
  async write(request: WriteRequest): Promise<Written | null> {
    if (this.busy()) return null;
    this.busy.set(true);
    this.error.set(null);
    try {
      return await firstValueFrom(this.port.write(request));
    } catch (err) {
      this.error.set(err instanceof AssistFailed ? err.kind : 'unknown');
      return null;
    } finally {
      this.busy.set(false);
    }
  }
}
