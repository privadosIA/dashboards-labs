import { Injectable, signal } from '@angular/core';

import { ProjectSummary } from './api.models';

const STORAGE_KEY = 'mo.clients';

/**
 * The projects of the chosen client labels. No label chosen means no filter (every project stays). A project with no label counts as `embedded`, the label the
 * server gives an ordinary project.
 */
export function byClients<T extends Pick<ProjectSummary, 'client'>>(projects: readonly T[], chosen: ReadonlySet<string>): T[] {
  return chosen.size === 0 ? [...projects] : projects.filter((p) => chosen.has(p.client || 'embedded'));
}

/** The client labels the user chose to narrow the projects list by; kept while the browser lets it, like the modes. */
@Injectable({ providedIn: 'root' })
export class ClientFilterStore {
  readonly chosen = signal<ReadonlySet<string>>(this.read());

  set(names: ReadonlySet<string>): void {
    this.chosen.set(new Set(names));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...names]));
    } catch {
      // not stored: it holds for this visit
    }
  }

  /** A chosen label that the server no longer reports is dropped, so a chip that is gone cannot keep the list empty. */
  keepOnly(known: readonly string[]): void {
    const kept = [...this.chosen()].filter((n) => known.includes(n));
    if (kept.length !== this.chosen().size) this.set(new Set(kept));
  }

  private read(): ReadonlySet<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return new Set((JSON.parse(raw) as unknown[]).filter((n): n is string => typeof n === 'string'));
    } catch {
      // no storage, or unreadable: no filter
    }
    return new Set();
  }
}
