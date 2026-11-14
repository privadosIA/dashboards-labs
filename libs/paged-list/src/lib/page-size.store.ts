import { Injectable } from '@angular/core';

const STORAGE_KEY = 'mo-paged-list-sizes';

/**
 * Remembers the page size chosen per list (by list id) for the rest of
 * the session.
 */
@Injectable({ providedIn: 'root' })
export class PageSizeStore {
  private sizes = new Map<string, number>();

  constructor() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.sizes = new Map(Object.entries(JSON.parse(raw) as Record<string, number>));
      }
    } catch {
      // storage unavailable: in-memory only
    }
  }

  get(listId: string, fallback: number): number {
    return this.sizes.get(listId) ?? fallback;
  }

  set(listId: string, size: number): void {
    this.sizes.set(listId, size);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.sizes)));
    } catch {
      // storage unavailable: in-memory only
    }
  }
}
