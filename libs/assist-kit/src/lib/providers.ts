import { InjectionToken, type Provider, inject } from '@angular/core';
import { ApiClient } from '@lab/api-client';
import { type Observable, catchError, defer, map, of, throwError } from 'rxjs';

/** A provider that can write for an assistant call: the built-in Ollama, another Ollama or an OpenAI-compatible server. A key is never part of it. */
export interface ProviderInfo {
  id: string;
  name: string;
  kind: 'ollama' | 'openai';
  baseUrl: string;
  /** The built-in Ollama: always there, never consented. */
  builtin: boolean;
  /** Not this machine: what the flow sends leaves it, so it needs the person's consent. */
  remote: boolean;
  keySet: boolean;
  /** This edition does not use its address: no task can run on it. */
  blocked: boolean;
  /** The text model the server has saved for it (may be empty). */
  model: string;
}

/** What the form of Add an external provider hands over. The key goes in this call only and is kept nowhere else. */
export interface NewProvider {
  name: string;
  kind: 'ollama' | 'openai';
  baseUrl: string;
  key?: string;
  model: string;
}

/** What an assistant picker needs to know about the providers. Nothing here writes the routing. */
export interface AssistProviders {
  /** The built-in Ollama first, then the saved ones. */
  list(): Observable<ProviderInfo[]>;
  /** Whether the built-in Ollama answers (the test sends nothing). */
  reachable(): Observable<boolean>;
  /** The models of a provider; empty when it does not answer or rejects the key. */
  models(id: string): Observable<string[]>;
  /** Saves a provider; errors with the server's reason (an address it refuses, a key over plain http). */
  add(input: NewProvider): Observable<ProviderInfo>;
  /** Consents to send data to the provider's current address. */
  acknowledge(id: string): Observable<void>;
}

type ServerProvider = { id: string; name: string; type: 'ollama' | 'openai'; base_url: string; text_model: string; builtin: boolean; remote: boolean; key_set: boolean; blocked?: boolean };

const infoOf = (p: ServerProvider): ProviderInfo => ({ id: p.id, name: p.name, kind: p.type, baseUrl: p.base_url, builtin: p.builtin, remote: p.remote, keySet: p.key_set, blocked: p.blocked === true, model: p.text_model });

/** The providers of the server the person connected to, through the typed client. */
export class ServerProviders implements AssistProviders {
  constructor(private readonly api: Pick<ApiClient, 'get' | 'post'>) {}

  list(): Observable<ProviderInfo[]> {
    return defer(() => this.api.get('/api/providers')).pipe(map((r) => (r.providers ?? []).map((p) => infoOf(p as ServerProvider))));
  }

  reachable(): Observable<boolean> {
    return defer(() => this.api.post('/api/settings/ollama/test', { body: {} })).pipe(
      map((r) => r.ok === true),
      catchError(() => of(false)),
    );
  }

  models(id: string): Observable<string[]> {
    return defer(() => this.api.post('/api/providers/{id}/test', { path: { id } })).pipe(
      map((r) => (r.ok === true ? (r.models ?? []).flatMap((m) => (m.name ? [m.name] : [])) : [])),
      catchError(() => of([] as string[])),
    );
  }

  add(input: NewProvider): Observable<ProviderInfo> {
    return defer(() => this.api.post('/api/providers', { body: { name: input.name.trim(), type: input.kind, base_url: input.baseUrl.trim(), text_model: input.model.trim(), ...(input.key ? { key: input.key } : {}) } })).pipe(map((p) => infoOf(p as ServerProvider)));
  }

  acknowledge(id: string): Observable<void> {
    return defer(() => this.api.post('/api/providers/{id}/acknowledge', { path: { id } })).pipe(map(() => undefined));
  }
}

/** The providers with no server: the built-in one, always reachable, with the in-memory adapter's models; added ones live as long as the page. */
export class MemoryProviders implements AssistProviders {
  private readonly added: ProviderInfo[] = [];

  constructor(
    private readonly builtinModels: () => Observable<string[]>,
    private readonly counter = () => this.added.length + 1,
  ) {}

  list(): Observable<ProviderInfo[]> {
    return of([{ id: 'ollama', name: 'Ollama', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', builtin: true, remote: false, keySet: false, blocked: false, model: '' }, ...this.added]);
  }

  reachable(): Observable<boolean> {
    return of(true);
  }

  models(id: string): Observable<string[]> {
    return id === 'ollama' ? this.builtinModels() : of(this.added.find((p) => p.id === id)?.model ? [this.added.find((p) => p.id === id)!.model] : []);
  }

  add(input: NewProvider): Observable<ProviderInfo> {
    if (!input.name.trim() || !input.baseUrl.trim()) return throwError(() => new Error('a provider needs a name and an address'));
    const info: ProviderInfo = { id: `memory-${this.counter()}`, name: input.name.trim(), kind: input.kind, baseUrl: input.baseUrl.trim(), builtin: false, remote: true, keySet: !!input.key, blocked: false, model: input.model.trim() };
    this.added.push(info);
    return of(info);
  }

  acknowledge(): Observable<void> {
    return of(undefined);
  }
}

/** What the picker injects. It has no default of its own: the host provides it (`provideAssistProviders`, or its own factory when the in-memory models come from its own port). */
export const ASSIST_PROVIDERS = new InjectionToken<AssistProviders>('ASSIST_PROVIDERS');

/** The providers of the server the person connected to, or the in-memory ones (`memory`: there is no server to ask; `builtinModels` lists the built-in Ollama's models). */
export function provideAssistProviders(options: { memory?: boolean; builtinModels?: () => Observable<string[]> } = {}): Provider {
  return {
    provide: ASSIST_PROVIDERS,
    useFactory: (): AssistProviders => (options.memory ? new MemoryProviders(options.builtinModels ?? (() => of([]))) : new ServerProviders(inject(ApiClient))),
  };
}
