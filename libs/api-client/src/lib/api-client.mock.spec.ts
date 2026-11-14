import { provideHttpClient, withFetch } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { inject } from 'vitest';

import { ApiClient } from './api-client';
import { ApiError } from './api-error';
import { provideApiClient } from './config';

// The client over real HTTP, against the mock of the API (started by vitest.mock-setup.mts, no server needed).
describe('ApiClient against the mock of the API', () => {
  let api: ApiClient;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch()), provideApiClient({ baseUrl: inject('mockUrl') })] });
    api = TestBed.inject(ApiClient);
  });

  const keys = (o: object) => Object.keys(o).sort();

  it('reads the settings with the seven blocks the contract describes, field by field', async () => {
    const s = await firstValueFrom(api.get('/api/settings'));
    expect(keys(s)).toEqual(['browser', 'diffrhythm2', 'heartmula', 'motion_model', 'music_motion', 'ollama', 'remote']);
    expect(keys(s.ollama)).toEqual(['host', 'remote', 'saved', 'source']);
    expect(keys(s.heartmula)).toEqual(['consented', 'remote', 'saved', 'token_set']);
    expect(keys(s.diffrhythm2)).toEqual(['consented', 'remote', 'saved', 'token_set']);
    expect(keys(s.motion_model)).toEqual(['default', 'saved']);
    expect(Object.keys(s.browser)).toEqual(expect.arrayContaining(['found', 'saved']));
    expect(typeof s.ollama.host).toBe('string');
    expect(typeof s.remote.max_calls).toBe('number');
  });

  it('reads the list of projects', async () => {
    const projects = await firstValueFrom(api.get('/api/projects'));
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
    for (const p of projects) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      // A video project has scenes; a music project has tracks.
      expect(typeof (p.scene_count ?? p.track_count)).toBe('number');
    }
  });

  it("reads one project's reviews by its path parameter", async () => {
    const [first] = await firstValueFrom(api.get('/api/projects'));
    expect(first.id).toBeDefined(); // the contract does not mark `id` as required, so its type allows undefined
    const reviews = await firstValueFrom(api.get('/api/projects/{id}/reviews', { path: { id: first.id as string } }));
    expect(reviews).toBeTruthy();
  });

  it('writes a setting and reads it back, then puts it as it was', async () => {
    const before = await firstValueFrom(api.get('/api/settings'));
    try {
      const after = await firstValueFrom(api.put('/api/settings', { body: { ollama_host: '192.168.1.50' } }));
      expect(after.ollama.saved).toContain('192.168.1.50');
      const again = await firstValueFrom(api.get('/api/settings'));
      expect(again.ollama.saved).toBe(after.ollama.saved);
    } finally {
      await firstValueFrom(api.put('/api/settings', { body: { ollama_host: before.ollama.saved } }));
    }
  });

  it("fails with the contract's error when the project does not exist", async () => {
    const e = (await firstValueFrom(api.get('/api/projects/{id}/config', { path: { id: 'no-such-project' } })).catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code]).toEqual([404, 'not_found']);
  });
});
