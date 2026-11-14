import { Injectable, computed, inject, signal } from '@angular/core';
import type { Part, PartLevel } from '@lab/motion-parts';
import { firstValueFrom } from 'rxjs';

import { MotionCatalogJson, MotionCatalogPartJson } from './api.models';
import { ApiService } from './api.service';

const LEVELS: readonly PartLevel[] = ['simple', 'medium', 'advanced'];

/** A part of the server's catalog, in the shape the form of its parameters takes. */
export function toPart(p: MotionCatalogPartJson): Part {
  return {
    name: p.name,
    description: p.description,
    levels: p.levels.filter((l): l is PartLevel => (LEVELS as readonly string[]).includes(l)),
    costMs: p.cost_ms,
    manual: p.manual === true,
    params: p.params.map((q) => ({
      name: q.name,
      type: q.type,
      default: q.default,
      ...(q.description ? { description: q.description } : {}),
      ...(q.min !== undefined ? { min: q.min } : {}),
      ...(q.max !== undefined ? { max: q.max } : {}),
      ...(q.max_length !== undefined ? { maxLength: q.max_length } : {}),
      ...(q.options ? { options: q.options } : {}),
    })),
  };
}

/**
 * The parts of the music-motion catalog, read once, for the scenes that are drawn by one. A server without that catalog
 * (it answers 404) or one that cannot be reached means there are none, and the controls that need them are not offered.
 */
@Injectable({ providedIn: 'root' })
export class MotionCatalogStore {
  private readonly api = inject(ApiService);

  private readonly raw = signal<MotionCatalogJson | null>(null);
  /** True once the server has answered, with the catalog or without it. */
  readonly known = signal(false);
  private requested = false;

  readonly parts = computed<readonly Part[]>(() => (this.raw()?.parts ?? []).map(toPart));
  /** The typefaces a design can use. */
  readonly fonts = computed<readonly string[]>(() => this.raw()?.fonts ?? []);
  /** The server has the catalog and it has parts: scenes can be drawn by one. */
  readonly available = computed(() => this.parts().length > 0);

  part(name: string): Part | undefined {
    return this.parts().find((p) => p.name === name);
  }

  /** Forgets that it was read, so the next `load()` reads it again (a part may have been approved meanwhile). */
  invalidate(): void {
    this.requested = false;
  }

  /** Reads it once; later calls do nothing until `invalidate()`. */
  async load(): Promise<void> {
    if (this.requested) return;
    this.requested = true;
    try {
      this.raw.set(await firstValueFrom(this.api.getMotionCatalog()));
    } catch {
      this.raw.set(null);
    } finally {
      this.known.set(true);
    }
  }
}
