import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';

/** One key for every dashboard: the ones served from the same origin share the server and the token. */
export const STORAGE_KEY = 'lab.connection';

/** What the person chooses. */
export interface ConnectionSettings {
  /** Server origin, e.g. "http://host:4666". Empty means the origin that serves the page. */
  server: string;
  /** Bearer token. Empty means no authentication. */
  token: string;
}

/** The two places the settings can live: the browser's (remembered) and the tab's. */
export interface ConnectionStores {
  persistent: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  session: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

/** A blocked storage (private mode) is `null`: the settings then apply to this page only. */
export const CONNECTION_STORES = new InjectionToken<ConnectionStores>('CONNECTION_STORES', {
  providedIn: 'root',
  factory: () => {
    const open = (get: () => Storage): Storage | null => {
      try {
        return get();
      } catch {
        return null;
      }
    };
    return { persistent: open(() => localStorage), session: open(() => sessionStorage) };
  },
});

/** Strips whitespace, a trailing "/" and a trailing "/api" from a server address. */
export function normalizeServer(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

interface Stored extends ConnectionSettings {
  remember: boolean;
}

/**
 * Where the API lives and how to authenticate to it, chosen by the person and kept as they asked. It is read when the
 * service is created (the page is reloaded when the settings change), so the rest of the application sees fixed values.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly stores = inject(CONNECTION_STORES);

  private readonly _server = signal('');
  private readonly _token = signal('');
  private readonly _remember = signal(true);

  readonly server = this._server.asReadonly();
  readonly token = this._token.asReadonly();
  readonly remember = this._remember.asReadonly();
  readonly hasToken = computed(() => this._token() !== '');
  /** True when the dashboard talks to a server other than the one that serves it. */
  readonly remote = computed(() => this._server() !== '');

  /** Whether the person has saved a connection in this browser: what a deployment's `config.json` must not replace. */
  private saved = false;

  constructor() {
    const saved = this.read();
    if (saved) {
      this.apply(saved, saved.remember);
      this.saved = true;
    }
  }

  /**
   * The connection a deployment gives to start with: the `server` and `token` of a `config.json` next to the page,
   * used for this visit when the person has saved nothing (and never saved by this). Anything that is not a JSON object
   * of text values, a missing file included, leaves the connection as it is; the server answers an unknown route with
   * the page of the front end, which is told apart by its content type. Never throws.
   */
  async loadDefaults(): Promise<void> {
    if (this.saved) return;
    try {
      const res = await fetch(new URL('config.json', document.baseURI), { cache: 'no-store' });
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return;
      const file = (await res.json()) as Partial<Record<'server' | 'token', unknown>> | null;
      if (!file || typeof file !== 'object') return;
      if (typeof file.server === 'string') this._server.set(normalizeServer(file.server));
      if (typeof file.token === 'string') this._token.set(file.token);
    } catch {
      // No file, not JSON, or the request failed: the connection stays the page's own server.
    }
  }

  /** Keeps the settings (persistent when remembered, in the tab when not). Answers whether the server or the token changed. */
  save(settings: ConnectionSettings, remember: boolean): boolean {
    this.saved = true;
    const changed = normalizeServer(settings.server) !== this._server() || (settings.token ?? '') !== this._token();
    this.apply(settings, remember);
    const [keep, other] = remember ? [this.stores.persistent, this.stores.session] : [this.stores.session, this.stores.persistent];
    try {
      other?.removeItem(STORAGE_KEY);
      keep?.setItem(STORAGE_KEY, JSON.stringify({ server: this._server(), token: this._token() }));
    } catch {
      // Storage unavailable or full: the settings still apply to this page.
    }
    return changed;
  }

  private apply(settings: ConnectionSettings, remember: boolean): void {
    this._server.set(normalizeServer(settings.server));
    this._token.set(settings.token ?? '');
    this._remember.set(remember);
  }

  private read(): Stored | null {
    for (const [store, remembered] of [[this.stores.persistent, true], [this.stores.session, false]] as const) {
      try {
        const raw = store?.getItem(STORAGE_KEY);
        if (!raw) continue;
        const value = JSON.parse(raw) as Partial<ConnectionSettings>;
        return { server: normalizeServer(value.server), token: typeof value.token === 'string' ? value.token : '', remember: remembered };
      } catch {
        // A corrupt or unreadable entry is ignored.
      }
    }
    return null;
  }
}
