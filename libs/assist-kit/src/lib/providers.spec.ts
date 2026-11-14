import { ApiClient } from '@lab/api-client';
import { firstValueFrom, of, throwError } from 'rxjs';

import { MemoryProviders, ServerProviders } from './providers';

const fake = (answers: Record<string, unknown>) => {
  const calls: { path: string; options?: { body?: unknown; path?: Record<string, string> } }[] = [];
  const api = {
    get: (path: string) => (calls.push({ path }), answer(answers[`GET ${path}`])),
    post: (path: string, options?: { body?: unknown; path?: Record<string, string> }) => (calls.push({ path, options }), answer(answers[`POST ${path}`])),
  } as unknown as Pick<ApiClient, 'get' | 'post'>;
  return { api, calls };
};
const answer = (a: unknown) => (a instanceof Error ? throwError(() => a) : of(a));

describe('ServerProviders', () => {
  it('lists the built-in Ollama first and the saved ones, without any key', async () => {
    const { api } = fake({
      'GET /api/providers': { providers: [{ id: 'ollama', name: 'Ollama', type: 'ollama', base_url: 'http://127.0.0.1:11434', text_model: '', vision_model: '', builtin: true, remote: false, key_set: false }, { id: 'router', name: 'My router', type: 'openai', base_url: 'https://r.example/v1', text_model: 'gpt-x', vision_model: '', builtin: false, remote: true, key_set: true }] },
    });
    const list = await firstValueFrom(new ServerProviders(api).list());
    expect(list.map((p) => [p.id, p.builtin, p.remote, p.keySet])).toEqual([['ollama', true, false, false], ['router', false, true, true]]);
    expect(list[1]).toMatchObject({ kind: 'openai', baseUrl: 'https://r.example/v1', model: 'gpt-x' });
    expect(JSON.stringify(list)).not.toContain('"key"');
  });

  it('says whether the built-in Ollama answers, and false when the test itself fails', async () => {
    expect(await firstValueFrom(new ServerProviders(fake({ 'POST /api/settings/ollama/test': { ok: true } }).api).reachable())).toBe(true);
    expect(await firstValueFrom(new ServerProviders(fake({ 'POST /api/settings/ollama/test': { ok: false, error: 'refused' } }).api).reachable())).toBe(false);
    expect(await firstValueFrom(new ServerProviders(fake({ 'POST /api/settings/ollama/test': new Error('down') }).api).reachable())).toBe(false);
  });

  it('lists the models of a provider, and none when it does not answer or rejects the key', async () => {
    const ok = fake({ 'POST /api/providers/{id}/test': { ok: true, models: [{ name: 'a' }, { name: 'b' }, {}] } });
    expect(await firstValueFrom(new ServerProviders(ok.api).models('router'))).toEqual(['a', 'b']);
    expect(ok.calls[0].options?.path).toEqual({ id: 'router' });
    expect(await firstValueFrom(new ServerProviders(fake({ 'POST /api/providers/{id}/test': { ok: false, error: 'key rejected' } }).api).models('router'))).toEqual([]);
  });

  it('adds a provider sending the key in that call only, and returns it without the key', async () => {
    const { api, calls } = fake({ 'POST /api/providers': { id: 'mine', name: 'Mine', type: 'openai', base_url: 'https://x/v1', text_model: 'm', vision_model: '', builtin: false, remote: true, key_set: true } });
    const info = await firstValueFrom(new ServerProviders(api).add({ name: ' Mine ', kind: 'openai', baseUrl: ' https://x/v1 ', key: 'sk-secret', model: 'm' }));
    expect(calls[0].options?.body).toEqual({ name: 'Mine', type: 'openai', base_url: 'https://x/v1', text_model: 'm', key: 'sk-secret' });
    expect(info).toMatchObject({ id: 'mine', keySet: true });
    expect(JSON.stringify(info)).not.toContain('sk-secret');
  });

  it('adds one without a key when none is given, and passes the server refusal on', async () => {
    const { api, calls } = fake({ 'POST /api/providers': { id: 'o', name: 'O', type: 'ollama', base_url: 'http://other:11434', text_model: '', vision_model: '', builtin: false, remote: true, key_set: false } });
    await firstValueFrom(new ServerProviders(api).add({ name: 'O', kind: 'ollama', baseUrl: 'http://other:11434', model: '' }));
    expect('key' in (calls[0].options!.body as object)).toBe(false);
    await expect(firstValueFrom(new ServerProviders(fake({ 'POST /api/providers': new Error('a key is not sent over plain http') }).api).add({ name: 'O', kind: 'openai', baseUrl: 'http://x', key: 'k', model: '' }))).rejects.toThrow('plain http');
  });

  it('consents to a provider', async () => {
    const { api, calls } = fake({ 'POST /api/providers/{id}/acknowledge': { id: 'router' } });
    await firstValueFrom(new ServerProviders(api).acknowledge('router'));
    expect(calls[0]).toMatchObject({ path: '/api/providers/{id}/acknowledge', options: { path: { id: 'router' } } });
  });
});

describe('MemoryProviders', () => {
  const memory = () => new MemoryProviders(() => of(['qwen3:8b']));

  it('has the built-in one, always reachable, with the in-memory adapter models', async () => {
    const p = memory();
    expect((await firstValueFrom(p.list())).map((x) => x.id)).toEqual(['ollama']);
    expect(await firstValueFrom(p.reachable())).toBe(true);
    expect(await firstValueFrom(p.models('ollama'))).toEqual(['qwen3:8b']);
  });

  it('keeps an added provider for the page, marked remote, with its model and no key shown', async () => {
    const p = memory();
    const info = await firstValueFrom(p.add({ name: 'Router', kind: 'openai', baseUrl: 'https://r/v1', key: 'secret', model: 'gpt' }));
    expect(info).toMatchObject({ remote: true, keySet: true, model: 'gpt' });
    expect((await firstValueFrom(p.list())).map((x) => x.id)).toEqual(['ollama', info.id]);
    expect(await firstValueFrom(p.models(info.id))).toEqual(['gpt']);
    expect(JSON.stringify(await firstValueFrom(p.list()))).not.toContain('secret');
    await expect(firstValueFrom(p.acknowledge())).resolves.toBeUndefined();
  });

  it('refuses a provider with no name or address', async () => {
    await expect(firstValueFrom(memory().add({ name: ' ', kind: 'openai', baseUrl: '', model: '' }))).rejects.toThrow();
  });
});
