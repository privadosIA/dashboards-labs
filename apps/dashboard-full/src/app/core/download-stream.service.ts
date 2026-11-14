import { Injectable, inject } from '@angular/core';

import { DownloadProgressPayload, DownloadStatePayload } from './api.models';
import { ConnectionService } from '@lab/server-connection';
import { EventSourceLike } from './run-stream.service';
import { TicketService } from '@lab/server-connection';

export interface DownloadStreamHandlers {
  onProgress(p: DownloadProgressPayload): void;
  onState(s: DownloadStatePayload): void;
  /** The server sent stream-end: the download reached a terminal state. */
  onEnd(): void;
}

/**
 * SSE consumer for /api/downloads/{id}/events, modeled on RunStreamService:
 * the server replays from the start on every (re)connect (so consumers just
 * apply events in order), stream-end closes the source, and with a token
 * the URL carries a short-lived ticket, reopened with a fresh one when the
 * browser gives up.
 */
@Injectable({ providedIn: 'root' })
export class DownloadStreamService {
  /** Factory seam so tests can inject a scripted source. */
  esFactory: (url: string) => EventSourceLike = (url) =>
    new EventSource(url) as unknown as EventSourceLike;

  private readonly conn = inject(ConnectionService);
  private readonly tickets = inject(TicketService);

  connect(id: string, h: DownloadStreamHandlers): { close(): void } {
    let es: EventSourceLike | null = null;
    let closed = false;
    let ended = false;
    const url = () => this.tickets.withTicket(`${this.conn.server()}/api/downloads/${id}/events`);

    const parse = <T>(e: MessageEvent<string>): T | null => {
      try {
        return JSON.parse(e.data) as T;
      } catch {
        return null; // never invent events from malformed data
      }
    };

    const open = () => {
      const src = this.esFactory(url());
      es = src;
      src.addEventListener('progress', (e) => {
        const p = parse<DownloadProgressPayload>(e);
        if (p) h.onProgress(p);
      });
      src.addEventListener('download-state', (e) => {
        const s = parse<DownloadStatePayload>(e);
        if (s) h.onState(s);
      });
      src.addEventListener('stream-end', () => {
        ended = true;
        src.close();
        h.onEnd();
      });
      src.onerror = () => {
        // readyState 2 = CLOSED: the browser will not retry by itself.
        if (src.readyState === 2 && !closed && !ended) {
          setTimeout(() => void reopen(), 1000);
        }
      };
    };
    const reopen = async () => {
      if (closed || ended) return;
      await this.tickets.ensure();
      if (!closed) open();
    };

    if (this.conn.hasToken()) {
      void this.tickets.ensure().then(() => {
        if (!closed) open();
      });
    } else {
      open();
    }

    return {
      close: () => {
        closed = true;
        es?.close();
      },
    };
  }
}
