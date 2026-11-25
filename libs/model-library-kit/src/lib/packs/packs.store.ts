import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { LanguageService } from '../core/language';
import { MODEL_LIBRARY_OPTIONS } from '../core/options';
import { reasonOf } from '../core/reason';
import { textsFor } from '../core/texts';
import { LibraryFailed, MODEL_LIBRARY_PORT, type ImportRequest, type ModelPack } from '../port';

/**
 * The packs of the library and what is being done to them. An install answers at once and goes on in the server, so the store asks the pack for its progress every `pollMs` until it is installed, failed or cancelled,
 * and stops when the screen that holds it is gone. A refusal is kept by pack, in the server's words.
 */
@Injectable()
export class PacksStore {
  private readonly port = inject(MODEL_LIBRARY_PORT);
  private readonly t = textsFor(inject(LanguageService).lang);
  private readonly pollMs = inject(MODEL_LIBRARY_OPTIONS, { optional: true })?.pollMs ?? 1000;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private gone = false;

  readonly packs = signal<readonly ModelPack[]>([]);
  /** `unavailable` when the server has no library (its routes are not there). */
  readonly status = signal<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  readonly error = signal('');
  /** The last refusal of each pack, by id. */
  readonly problems = signal<Readonly<Record<string, string>>>({});
  readonly busy = signal<ReadonlySet<string>>(new Set());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.gone = true;
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
    });
  }

  async load(): Promise<void> {
    try {
      this.set(await firstValueFrom(this.port.packs()));
      this.status.set('ready');
    } catch (e) {
      const absent = e instanceof LibraryFailed && (e.status === 404 || e.status === 501);
      this.status.set(absent ? 'unavailable' : 'error');
      this.error.set(reasonOf(e, this.t));
    }
  }

  private set(packs: readonly ModelPack[]): void {
    this.packs.set(packs);
    for (const p of packs) if (p.state === 'installing') this.follow(p.id);
  }

  /** Puts the server's account of a pack in the list. */
  private update(pack: ModelPack): void {
    const list = this.packs();
    this.packs.set(list.some((p) => p.id === pack.id) ? list.map((p) => (p.id === pack.id ? pack : p)) : [...list, pack]);
    if (pack.state === 'installing') this.follow(pack.id);
  }

  private follow(id: string): void {
    if (this.gone || this.timers.has(id)) return;
    this.timers.set(
      id,
      setTimeout(async () => {
        this.timers.delete(id);
        if (this.gone) return;
        try {
          this.update(await firstValueFrom(this.port.pack(id)));
        } catch (e) {
          this.problem(id, e);
        }
      }, this.pollMs),
    );
  }

  private problem(id: string, e: unknown): void {
    this.problems.update((p) => ({ ...p, [id]: reasonOf(e, this.t) }));
  }

  private async run(id: string, work: () => Promise<void>): Promise<void> {
    this.busy.update((b) => new Set(b).add(id));
    this.problems.update(({ [id]: _gone, ...rest }) => rest);
    try {
      await work();
    } catch (e) {
      this.problem(id, e);
    } finally {
      this.busy.update((b) => {
        const next = new Set(b);
        next.delete(id);
        return next;
      });
    }
  }

  /** Installs a pack. A 409 means it already is, or is being: the pack is read again so the screen shows what it really is. */
  install(id: string): Promise<void> {
    return this.run(id, async () => {
      try {
        this.update(await firstValueFrom(this.port.install(id)));
      } catch (e) {
        if (e instanceof LibraryFailed && e.status === 409) this.update(await firstValueFrom(this.port.pack(id)));
        else throw e;
      }
    });
  }

  cancel(id: string): Promise<void> {
    return this.run(id, async () => {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
      try {
        this.update(await firstValueFrom(this.port.cancel(id)));
      } catch (e) {
        if (e instanceof LibraryFailed && e.status === 409) this.update(await firstValueFrom(this.port.pack(id)));
        else throw e;
      }
    });
  }

  /** Removes a pack and reads the list again: a pack of the server's list is available again, an imported one is gone. */
  remove(id: string): Promise<void> {
    return this.run(id, async () => {
      await firstValueFrom(this.port.remove(id));
      this.set(await firstValueFrom(this.port.packs()));
    });
  }

  /** Imports a zip; answers the pack, or `null` after keeping the refusal under the form's own id (see `importProblem`). */
  async importPack(request: ImportRequest): Promise<ModelPack | null> {
    try {
      const pack = await firstValueFrom(this.port.importPack(request));
      this.update(pack);
      return pack;
    } catch (e) {
      this.importProblem.set(reasonOf(e, this.t));
      return null;
    }
  }

  readonly importProblem = signal('');
}
