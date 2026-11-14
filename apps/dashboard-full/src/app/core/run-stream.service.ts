import { Injectable, inject, signal } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';

import { PipelineEvent, RunStatePayload } from './api.models';
import { ConnectionService } from '@lab/server-connection';
import { RunEvents } from './run-events';
import { TicketService } from '@lab/server-connection';

/** A live view over one run's SSE stream (design D3). */
export interface RunStream {
  /** Parsed pipeline events, verbatim payloads (presence-based fields). */
  readonly events: Signal<PipelineEvent[]>;
  /** The raw JSON lines exactly as the server sent them (for the log). */
  readonly lines: Signal<string[]>;
  /** Latest server-originated run-state notification. */
  readonly state: Signal<RunStatePayload | null>;
  /** True once the explicit stream-end notification arrived. */
  readonly ended: Signal<boolean>;
  close(): void;
}

/** The subset of EventSource the service relies on (test seam). */
export interface EventSourceLike {
  readonly readyState?: number;
  onopen: ((e: unknown) => void) | null;
  onerror?: ((e: unknown) => void) | null;
  onmessage: ((e: MessageEvent<string>) => void) | null;
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void): void;
  close(): void;
}

/**
 * SSE consumer for /api/runs/{id}/events. Reconnection is EventSource's
 * own; because the server replays from zero on every (re)connect, the
 * buffers reset on open — no cursor bookkeeping (design D3). stream-end
 * closes the source, otherwise EventSource would reconnect forever.
 *
 * With a token set, the URL carries a short-lived ticket (EventSource
 * cannot send headers). Native retries reuse the old URL, so when the
 * browser gives up (readyState CLOSED, e.g. an expired ticket) the
 * stream reopens itself with a fresh ticket.
 */
@Injectable({ providedIn: 'root' })
export class RunStreamService {
  /** Factory seam so tests can inject a scripted source. */
  esFactory: (url: string) => EventSourceLike = (url) =>
    new EventSource(url) as unknown as EventSourceLike;

  private readonly conn = inject(ConnectionService);
  private readonly tickets = inject(TicketService);
  private readonly events = inject(RunEvents);

  connect(runId: string): RunStream {
    const events: WritableSignal<PipelineEvent[]> = signal([]);
    const lines: WritableSignal<string[]> = signal([]);
    const state = signal<RunStatePayload | null>(null);
    const ended = signal(false);

    let es: EventSourceLike | null = null;
    let closed = false;
    const url = () => this.tickets.withTicket(`${this.conn.server()}/api/runs/${runId}/events`);

    const open = () => {
      const src = this.esFactory(url());
      es = src;
      src.onopen = () => {
        // Full replay follows: drop anything from a previous connection.
        events.set([]);
        lines.set([]);
      };
      src.onmessage = (e) => {
        lines.update((l) => [...l, e.data]);
        try {
          const ev = JSON.parse(e.data) as PipelineEvent;
          events.update((evs) => [...evs, ev]);
        } catch {
          // Not JSON: never invent pipeline events.
        }
      };
      src.addEventListener('run-state', (e) => {
        try {
          const next = JSON.parse(e.data) as RunStatePayload;
          state.set(next);
          if (next.state !== 'queued' && next.state !== 'running') this.events.ended.update((n) => n + 1);
        } catch {
          // ignore malformed notification
        }
      });
      src.addEventListener('stream-end', () => {
        ended.set(true);
        src.close();
      });
      src.onerror = () => {
        // readyState 2 = CLOSED: the browser will not retry by itself.
        if (src.readyState === 2 && !closed && !ended()) {
          setTimeout(() => void reopen(), 1000);
        }
      };
    };
    const reopen = async () => {
      if (closed || ended()) return;
      await this.tickets.ensure();
      if (!closed) open();
    };

    if (this.conn.hasToken()) {
      // Wait for a ticket so the first connection is already authorized.
      void this.tickets.ensure().then(() => {
        if (!closed) open();
      });
    } else {
      open();
    }

    return {
      events: events.asReadonly(),
      lines: lines.asReadonly(),
      state: state.asReadonly(),
      ended: ended.asReadonly(),
      close: () => {
        closed = true;
        es?.close();
      },
    };
  }
}
