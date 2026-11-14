import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { EngineId, GeneratorName } from '../song/model';
import { SONGS } from '../song/tokens';

/** How often an engine that starts is looked at, and for how long. */
const POLL_MS = 3000;
const GIVE_UP_MS = 120_000;

/**
 * Starts and stops the engines of the server for the Composer and the Engines panel. An engine that starts is looked at
 * every few seconds until it is up (or two minutes pass); `version` goes up each time the screens should read the engines again.
 */
@Injectable({ providedIn: 'root' })
export class EngineControl {
  private readonly port = inject(SONGS);
  /** The engines that were asked to start and are not up yet. */
  readonly starting = signal<ReadonlySet<string>>(new Set());
  /** Goes up when something started, stopped or came up. */
  readonly version = signal(0);
  private readonly until = new Map<string, number>();
  private poll?: ReturnType<typeof setInterval>;

  /** Asks for the engine to start and keeps an eye on it; errors with what the port says (`EngineFailed`) and then it is not starting. */
  async start(engine: GeneratorName | EngineId): Promise<void> {
    if (this.starting().has(engine)) return;
    await firstValueFrom(this.port.start(engine));
    // ACE-Step has no container: there is nothing to wait for
    if (engine === 'ace-step') return;
    this.until.set(engine, Date.now() + GIVE_UP_MS);
    this.starting.update((s) => new Set(s).add(engine));
    this.version.update((n) => n + 1);
    this.poll ??= setInterval(() => void this.look(), POLL_MS);
  }

  /** Stops the engine; errors with what the port says (`EngineFailed`, `busy` when a run uses it). */
  async stop(engine: EngineId): Promise<void> {
    await firstValueFrom(this.port.stopEngine(engine));
    this.forget(engine);
    this.version.update((n) => n + 1);
  }

  private async look(): Promise<void> {
    let up: ReadonlySet<string> = new Set();
    try {
      up = new Set((await firstValueFrom(this.port.containers())).filter((e) => e.available).map((e) => e.engine));
    } catch {
      // the server did not answer this time: it is asked again at the next look
    }
    for (const engine of this.starting()) if (up.has(engine) || Date.now() > (this.until.get(engine) ?? 0)) this.forget(engine);
    this.version.update((n) => n + 1);
    if (!this.starting().size) {
      clearInterval(this.poll);
      this.poll = undefined;
    }
  }

  private forget(engine: string): void {
    this.until.delete(engine);
    this.starting.update((s) => {
      const next = new Set(s);
      next.delete(engine);
      return next;
    });
  }
}
