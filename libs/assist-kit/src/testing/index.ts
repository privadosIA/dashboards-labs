import type { ComponentFixture } from '@angular/core/testing';
import { type Observable, of, tap } from 'rxjs';

import type { AssistProviders, NewProvider, ProviderInfo } from '../lib/providers';

/** Lets a component's asynchronous reads settle (three rounds of change detection). */
export const settle = async (fixture: ComponentFixture<unknown>): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
};

export const FAKE_BUILTIN: ProviderInfo = { id: 'ollama', name: 'Ollama', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', builtin: true, remote: false, keySet: false, blocked: false, model: '' };
export const FAKE_ROUTER: ProviderInfo = { id: 'router', name: 'My router', kind: 'openai', baseUrl: 'https://r.example/v1', builtin: false, remote: true, keySet: true, blocked: false, model: 'gpt-x' };
const FAKE_LAB: ProviderInfo = { id: 'lab', name: 'Lab box', kind: 'ollama', baseUrl: 'http://lab:11434', builtin: false, remote: false, keySet: false, blocked: false, model: '' };

/** A providers port the spec drives. */
export class FakeProviders implements AssistProviders {
  acknowledged: string[] = [];
  added: NewProvider[] = [];
  constructor(
    public providers: ProviderInfo[] = [FAKE_BUILTIN, FAKE_ROUTER, FAKE_LAB],
    public up = true,
    private readonly addAnswer: () => Observable<ProviderInfo> = () => of({ ...FAKE_ROUTER, id: 'mine', name: 'Mine', model: 'm' }),
  ) {}
  list = () => of(this.providers);
  reachable = () => of(this.up);
  models = (id: string) => of(id === 'router' ? ['gpt-x', 'gpt-y'] : id === 'mine' ? ['m'] : ['qwen3:8b']);
  // a provider that was added is listed from then on, as the server does
  add = (input: NewProvider) => (this.added.push(input), this.addAnswer().pipe(tap((info) => this.providers.push(info))));
  acknowledge = (id: string) => (this.acknowledged.push(id), of(undefined));
}
