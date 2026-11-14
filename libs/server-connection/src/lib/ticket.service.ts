import { Injectable, Injector, inject, signal } from '@angular/core';
import { ApiClient } from '@lab/api-client';
import { firstValueFrom } from 'rxjs';

import { ConnectionService } from './connection.service';

/** A ticket is renewed when this much of its life (ms) is left. */
const RENEW_MARGIN_MS = 60_000;

/**
 * Short-lived tickets for what cannot carry an Authorization header (`<video>`, `<img>`, download links). Only active
 * while a token is set; renewed before it expires. A dashboard calls `withTicket` where it shows a media address.
 */
@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly injector = inject(Injector);
  private readonly connection = inject(ConnectionService);

  private readonly _ticket = signal<string | null>(null);
  /** The ticket in hand, or null without a token or before the first one arrives. */
  readonly ticket = this._ticket.asReadonly();

  private expiresAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight: Promise<string | null> | null = null;

  constructor() {
    if (this.connection.hasToken()) void this.ensure();
  }

  /** The address with `?ticket=` when a token is set and a ticket is held; otherwise as it came. */
  withTicket(url: string): string {
    const ticket = this._ticket();
    if (!this.connection.hasToken() || !ticket) return url;
    return `${url}${url.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}`;
  }

  /** A ticket with at least the renewal margin left, or null without a token or when the server refuses. */
  ensure(): Promise<string | null> {
    if (!this.connection.hasToken()) return Promise.resolve(null);
    if (this._ticket() && this.expiresAt - Date.now() > RENEW_MARGIN_MS) return Promise.resolve(this._ticket());
    this.inflight ??= this.fetch().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async fetch(): Promise<string | null> {
    try {
      const answer = await firstValueFrom(this.injector.get(ApiClient).post('/api/auth/ticket'));
      this.expiresAt = Date.parse(answer.expiresAt ?? '') || Date.now() + 10 * 60_000;
      this._ticket.set(answer.ticket ?? null);
      this.schedule();
      return answer.ticket ?? null;
    } catch {
      // The call that failed already told the page (401, no answer): there is simply no ticket.
      return null;
    }
  }

  private schedule(): void {
    clearTimeout(this.timer);
    const wait = Math.max(this.expiresAt - Date.now() - RENEW_MARGIN_MS, 1000);
    this.timer = setTimeout(() => void this.ensure(), wait);
  }
}
