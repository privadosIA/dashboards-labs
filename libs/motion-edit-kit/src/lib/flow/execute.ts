import { AnimationFailure } from '@lab/animation-core';
import { AssistFailed, EngineFailed, SongRefused } from '@lab/music-studio-kit';
import { type Observable, Subscription, timer } from 'rxjs';

import type { FlowStore } from './flow.store';
import type { StepId } from './model';

/** What a step does while it works: it may report how far it is, and it ends with its result and what it made on the server. */
export type StepEvent = { kind: 'progress'; info: Record<string, unknown> } | { kind: 'done'; result: Record<string, unknown>; refs?: Parameters<FlowStore['setRefs']>[0] };

/** The default pause before asking again when the server is drawing something else. */
export const BUSY_RETRY_MS = 10_000;

export interface Failure {
  reason: string;
  /** The server is busy with another job: the card says so and tries again by itself while it is visible. */
  busy: boolean;
}

/** What went wrong, in the server's own words where it gave them. */
export function failureOf(e: unknown): Failure {
  if (e instanceof AnimationFailure) return { reason: e.reason || e.kind, busy: e.kind === 'busy' };
  if (e instanceof AssistFailed) return { reason: `${e.kind}${e.detail ? `: ${e.detail}` : ''}`, busy: e.kind === 'busy' };
  if (e instanceof EngineFailed) return { reason: `${e.kind}${e.reason ? `: ${e.reason}` : ''}`, busy: e.kind === 'busy' };
  if (e instanceof SongRefused) return { reason: e.problems.join(', '), busy: false };
  return { reason: e instanceof Error ? e.message : String(e), busy: false };
}

export interface ExecuteOptions {
  /** Called with each progress report (the card shows it). */
  onProgress?: (info: Record<string, unknown>) => void;
  /** Called when the server is busy and the step will be tried again; `false` when it is not waiting any more. */
  onBusy?: (waiting: boolean) => void;
  busyRetryMs?: number;
}

/**
 * Runs a step against the store: it starts (`running`), reports progress, and ends in review with its result, or failed with the reason. A busy answer is waited for: the step
 * is tried again every `busyRetryMs` until it is accepted or the returned subscription is unsubscribed (the card left the screen).
 */
export function execute(store: FlowStore, step: StepId, work: () => Observable<StepEvent>, options: ExecuteOptions = {}): Subscription {
  const retryMs = options.busyRetryMs ?? BUSY_RETRY_MS;
  const outer = new Subscription();
  const attempt = (): void => {
    store.run(step);
    let finished = false;
    const inner = work().subscribe({
      next: (event) => {
        if (event.kind === 'progress') options.onProgress?.(event.info);
        else {
          finished = true;
          options.onBusy?.(false);
          if (event.refs) store.setRefs(event.refs);
          store.complete(step, event.result);
        }
      },
      error: (e: unknown) => {
        const failure = failureOf(e);
        if (failure.busy) {
          options.onBusy?.(true);
          outer.add(timer(retryMs).subscribe(attempt));
          return;
        }
        options.onBusy?.(false);
        store.fail(step, failure.reason);
      },
      complete: () => {
        if (!finished) store.fail(step, 'no-result');
      },
    });
    outer.add(inner);
  };
  attempt();
  return outer;
}
