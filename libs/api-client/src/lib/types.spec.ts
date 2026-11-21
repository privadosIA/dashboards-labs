import { ApiClient } from './api-client';

// Compile-time checks: this file only has to compile (the test builder fails on a type error, and on a
// `@ts-expect-error` that no longer expects one). The calls are never run: `run` is false.
function typing(api: ApiClient, run: boolean): void {
  if (!run) return;

  // Calls the contract allows, with the answer typed by the contract.
  api.get('/api/settings').subscribe((s) => {
    const host: string = s.ollama.host;
    const calls: number = s.remote.max_calls;
    void [host, calls];
  });
  api.get('/api/runs/{id}/resources', { path: { id: 'r1' } });
  api.get('/api/stats', { query: { project: 'demo' } });
  api.put('/api/settings', { body: { ollama_host: '192.168.1.50' } });

  // A path the contract does not have.
  // @ts-expect-error not a path of the contract
  api.get('/api/nothing');

  // A method the path does not have (/api/settings has get and put).
  // @ts-expect-error /api/settings has no POST
  api.post('/api/settings');

  // A body of the wrong shape.
  // @ts-expect-error ollama_host is a string
  api.put('/api/settings', { body: { ollama_host: 5 } });

  // A required body left out.
  // @ts-expect-error PUT /api/settings needs its body
  api.put('/api/settings');

  // A path parameter left out.
  // @ts-expect-error the path needs {id}
  api.get('/api/runs/{id}/resources');

  // A query parameter the operation does not declare.
  // @ts-expect-error not a query parameter of /api/stats
  api.get('/api/stats', { query: { surprise: 1 } });

  // An answer used as another type.
  api.get('/api/settings').subscribe((s) => {
    // @ts-expect-error max_calls is a number
    const wrong: string = s.remote.max_calls;
    void wrong;
  });

  // Only a stream path can be opened as one.
  api.streamUrl('/api/runs/{id}/events', { path: { id: 'r1' } });
  // @ts-expect-error /api/settings is not an event stream
  api.streamUrl('/api/settings');
}
void typing;

describe('the types of the client', () => {
  it('are checked when this file compiles', () => {
    expect(typeof typing).toBe('function');
  });
});
