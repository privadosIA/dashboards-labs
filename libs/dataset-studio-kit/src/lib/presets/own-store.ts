import type { Preset } from './model';

/** Where the presets that are not the bundled sample live when the server has no store: the person's own and the imported ones. */
export interface PresetStore {
  all(): Promise<Preset[]>;
  put(presets: readonly Preset[]): Promise<void>;
  delete(id: string): Promise<void>;
}

export class MemoryPresetStore implements PresetStore {
  private readonly map = new Map<string, Preset>();
  all(): Promise<Preset[]> {
    return Promise.resolve([...this.map.values()]);
  }
  put(presets: readonly Preset[]): Promise<void> {
    for (const p of presets) this.map.set(p.id, p);
    return Promise.resolve();
  }
  delete(id: string): Promise<void> {
    this.map.delete(id);
    return Promise.resolve();
  }
}

const DB = 'dataset-studio';
const STORE = 'presets';

/**
 * The browser's IndexedDB: one database, one store of presets by id. The browser may refuse it (a private window, blocked data): then it behaves as a memory store for the life of the page
 * and nothing is reported, since the studio works without it.
 */
export class IndexedDbPresetStore implements PresetStore {
  private readonly fallback = new MemoryPresetStore();
  private opened: Promise<IDBDatabase | null> | null = null;

  private db(): Promise<IDBDatabase | null> {
    this.opened ??= new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.opened;
  }

  private async run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void, read?: (r: IDBRequest) => T): Promise<T | null> {
    const db = await this.db();
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(read && request ? read(request) : null);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async all(): Promise<Preset[]> {
    const rows = await this.run<Preset[]>('readonly', (s) => s.getAll(), (r) => r.result as Preset[]);
    return rows ?? this.fallback.all();
  }

  async put(presets: readonly Preset[]): Promise<void> {
    const done = await this.run('readwrite', (s) => void presets.forEach((p) => s.put(p)));
    if (done === null && !(await this.db())) await this.fallback.put(presets);
  }

  async delete(id: string): Promise<void> {
    const done = await this.run('readwrite', (s) => void s.delete(id));
    if (done === null && !(await this.db())) await this.fallback.delete(id);
  }
}
