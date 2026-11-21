import { Injectable, inject } from '@angular/core';

import { ConnectionService, TicketService } from '@lab/server-connection';
import { InstallJob } from './api.models';
import { EventSourceLike } from './run-stream.service';

export interface InstallStreamHandlers {
  /** The whole job, each time it changes (the server replays them from the start on every connect). */
  onState(job: InstallJob): void;
  /** A line of the output of the program that runs. */
  onLog(line: string): void;
  /** The server sent stream-end: the job reached a terminal state. */
  onEnd(): void;
}

/**
 * SSE consumer for /api/music/installs/{id}/events, modeled on DownloadStreamService: the server replays from the start on every (re)connect (so
 * consumers just apply events in order), stream-end closes the source, and with a token the URL carries a short-lived ticket, reopened with a fresh
 * one when the browser gives up.
 */
@Injectable({ providedIn: 'root' })
export class InstallStreamService {
  /** Factory seam so tests can inject a scripted source. */
  esFactory: (url: string) => EventSourceLike = (url) => new EventSource(url) as unknown as EventSourceLike;

  private readonly conn = inject(ConnectionService);
  private readonly tickets = inject(TicketService);

  connect(id: string, h: InstallStreamHandlers): { close(): void } {
    let es: EventSourceLike | null = null;
    let closed = false;
    let ended = false;
    const url = () => this.tickets.withTicket(`${this.conn.server()}/api/music/installs/${id}/events`);

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
      src.addEventListener('state', (e) => {
        const job = parse<InstallJob>(e);
        if (job) h.onState(job);
      });
      src.addEventListener('log', (e) => {
        const l = parse<{ line?: string }>(e);
        if (typeof l?.line === 'string') h.onLog(l.line);
      });
      src.addEventListener('stream-end', () => {
        ended = true;
        src.close();
        h.onEnd();
      });
      src.onerror = () => {
        // readyState 2 = CLOSED: the browser will not retry by itself.
        if (src.readyState === 2 && !closed && !ended) setTimeout(() => void reopen(), 1000);
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
