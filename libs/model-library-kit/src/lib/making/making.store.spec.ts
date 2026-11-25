import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { MODEL_LIBRARY_OPTIONS } from '../core/options';
import { InMemoryModelLibrary, type ServiceKind } from '../memory.adapter';
import { LibraryFailed, MODEL_LIBRARY_PORT, type ModelLibraryPort } from '../port';
import { MakingStore } from './making.store';

const until = async (ok: () => boolean, ms = 3000): Promise<void> => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
};

function setup(service: ServiceKind = 'default', port?: ModelLibraryPort, options: { docker?: boolean; external?: boolean } = {}): { store: MakingStore; lib: InMemoryModelLibrary } {
  const lib = new InMemoryModelLibrary({ service, ...options });
  TestBed.configureTestingModule({
    providers: [MakingStore, { provide: MODEL_LIBRARY_PORT, useValue: port ?? lib }, { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang: 'en', pollMs: 2 } }],
  });
  return { store: TestBed.inject(MakingStore), lib };
}

describe('MakingStore', () => {
  it('reads the engines: triposr has its weights and a stopped container, sf3d has no key', async () => {
    const { store } = setup();
    await store.load();
    expect(store.status()).toBe('ready');
    expect(store.engines()['triposr'].reason).toBe('not_running');
    expect(store.engines()['sf3d'].reason).toBe('key_missing');
    expect(store.usable()).toEqual([]);
  });

  it('reads a server with no 3D service as "none", not as an error', async () => {
    const { store } = setup('none');
    await store.load();
    expect(store.status()).toBe('none');
    expect(store.error()).toBe('');
  });

  it('says an engine call that fails, in the server’s words', async () => {
    const { store } = setup('default', { engines: () => throwError(() => new LibraryFailed(500, 'the service fell')) } as unknown as ModelLibraryPort);
    await store.load();
    expect(store.status()).toBe('error');
    expect(store.error()).toBe('the service fell');
  });

  it('starts the container and keeps asking until the engine is available, then stops asking', async () => {
    const { store, lib } = setup();
    await store.load();
    await store.start('triposr');
    expect(store.engines()['triposr'].container?.state).toBe('starting');
    await until(() => store.engines()['triposr'].available);
    expect(store.usable()).toEqual(['triposr']);
    const asked = vi.spyOn(lib, 'engines');
    await new Promise((r) => setTimeout(r, 20));
    expect(asked).not.toHaveBeenCalled();
  });

  it('gives up on a container that never comes up, and says so', async () => {
    const starting = { triposr: { available: false, mode: 'local', reason: 'not_running', container: { state: 'starting' } } };
    const port = { engines: () => of(starting), startEngine: () => of({ state: 'starting' }), generations: () => of([]) } as unknown as ModelLibraryPort;
    const { store } = setup('default', port);
    await store.load();
    await store.start('triposr');
    await until(() => store.gaveUp());
    const asked = vi.spyOn(port, 'engines');
    await new Promise((r) => setTimeout(r, 20));
    expect(asked).not.toHaveBeenCalled();
  });

  it('a start that the server refuses (409) is kept under the engine with its reason in words', async () => {
    const { store } = setup();
    await store.load();
    await store.start('sf3d');
    expect(store.problems()['sf3d']).toContain('Hugging Face key');
  });

  it('stops the container', async () => {
    const { store } = setup('running');
    await store.load();
    expect(store.usable()).toEqual(['triposr']);
    await store.stop('triposr');
    expect(store.engines()['triposr'].reason).toBe('not_running');
  });

  it('gives the plan without changing anything, and downloads only on confirm, following the job to done', async () => {
    const { store, lib } = setup('bare');
    await store.load();
    expect(store.engines()['triposr'].reason).toBe('no_weights');
    const plan = await store.plan('triposr');
    expect(plan?.gated).toBe(false);
    expect(plan?.bytes).toBeGreaterThan(0);
    expect(lib.calls.filter((c) => c.startsWith('install'))).toEqual([]);
    await store.confirmInstall('triposr');
    expect(store.jobs()['triposr'].state).toBe('running');
    await until(() => store.jobs()['triposr'].state === 'done');
    expect(store.jobs()['triposr'].log).toEqual(['weights: done']);
    await until(() => store.engines()['triposr'].reason === 'not_running');
  });

  it('cancels a download', async () => {
    const { store } = setup('bare');
    await store.load();
    await store.confirmInstall('triposr');
    await store.cancelInstall('triposr');
    expect(store.jobs()['triposr'].state).toBe('cancelled');
  });

  it('keeps the refusal of a plan under the engine and answers null', async () => {
    const { store } = setup('bare');
    await store.load();
    expect(await store.plan('sf3d')).toBeNull();
    expect(store.problems()['sf3d']).toContain('Hugging Face key');
  });

  it('follows a generation through its steps to done and tells that one ended', async () => {
    const { store } = setup('running');
    await store.load();
    const made = await store.generate({ prompt: 'a retro roller skate', engine: 'triposr', detail: 'normal' });
    expect(made?.state).toBe('queued');
    expect(store.generations()[0].id).toBe(made?.id);
    const seen = new Set<string>();
    await until(() => {
      const g = store.generations()[0];
      if (g.step) seen.add(g.step);
      return g.state === 'done';
    });
    expect(store.generations()[0].model).toBe('generated/a-retro-roller-skate');
    expect(seen.has('picture') && seen.has('model')).toBe(true);
    expect(store.finished()).toBe(1);
  });

  it('keeps the server’s refusal of a generation (an engine that cannot be used) with its reason in words', async () => {
    const { store } = setup();
    await store.load();
    expect(await store.generate({ prompt: 'a cup', engine: 'triposr' })).toBeNull();
    expect(store.problems()['generate']).toContain('service is stopped');
    expect(store.generations()).toEqual([]);
  });

  it('cancels a running generation and removes a finished one without touching its model', async () => {
    const { store, lib } = setup('running');
    await store.load();
    const one = await store.generate({ prompt: 'first' });
    await store.cancelGeneration(one!.id);
    expect(store.generations()[0].state).toBe('cancelled');
    const two = await store.generate({ prompt: 'second' });
    await until(() => store.generations().find((g) => g.id === two!.id)?.state === 'done');
    await store.removeGeneration(two!.id);
    expect(store.generations().some((g) => g.id === two!.id)).toBe(false);
    expect(lib.all().some((m) => m.id === 'generated/second')).toBe(true);
  });

  it('stops asking when the screen is gone', async () => {
    const { store, lib } = setup('running');
    await store.load();
    await store.generate({ prompt: 'x', engine: 'triposr' });
    TestBed.resetTestingModule();
    const asked = vi.spyOn(lib, 'generations');
    await new Promise((r) => setTimeout(r, 30));
    expect(asked).not.toHaveBeenCalled();
    void store;
  });

  describe('backends', () => {
    it('reads what each backend has and the one in use: one setting for both engines', async () => {
      const { store } = setup('noservice');
      await store.load();
      expect(store.backend()).toEqual({ backend: 'dotnet', source: 'default' });
      expect(store.backendOf('triposr')).toBe('dotnet');
      expect(store.backendOf('sf3d')).toBe('dotnet');
      expect(store.engines()['triposr'].backends?.['dotnet'].missing).toEqual(['service', 'weights']);
      expect(store.engines()['triposr'].backends?.['docker'].missing).toEqual(['weights']);
      expect(store.engines()['triposr'].reason).toBe('no_service');
      expect(store.canChoose('triposr')).toBe(true);
      expect(store.canChoose('sf3d')).toBe(true);
      expect(Object.keys(store.engines()['sf3d'].backends ?? {})).toEqual(['dotnet', 'docker']);
    });

    it('switches the backend, reads the engines again and goes back to the default', async () => {
      const { store } = setup('noservice');
      await store.load();
      await store.setBackend('docker');
      expect(store.backend()).toEqual({ backend: 'docker', source: 'setting' });
      expect(store.engines()['triposr'].reason).toBe('no_weights');
      await store.setBackend('');
      expect(store.backend()).toEqual({ backend: 'dotnet', source: 'default' });
      expect(store.engines()['triposr'].reason).toBe('no_service');
    });

    it('keeps the server’s refusal of docker that does not answer, and the choice as it was', async () => {
      const { store } = setup('default', undefined, { docker: false });
      await store.load();
      await store.setBackend('docker');
      expect(store.problems()['backend']).toContain('Docker does not answer');
      expect(store.backend()?.backend).toBe('dotnet');
    });

    it('offers no choice for an external service, and keeps the refusal if it is asked', async () => {
      const { store } = setup('default', undefined, { external: true });
      await store.load();
      expect(store.canChoose('triposr')).toBe(false);
      await store.setBackend('docker');
      expect(store.problems()['backend']).toContain('MODEL3D_HOST');
    });

    it('does not offer the choice when the server does not say which backend is in use', async () => {
      const lib = new InMemoryModelLibrary();
      const old: ModelLibraryPort = Object.assign(Object.create(lib), { modelBackend: () => of(null) });
      const { store } = setup('default', old);
      await store.load();
      expect(store.backend()).toBeNull();
      expect(store.canChoose('triposr')).toBe(false);
      expect(store.status()).toBe('ready');
    });

    it('does not break the screen if reading the backend fails', async () => {
      const lib = new InMemoryModelLibrary();
      const failing: ModelLibraryPort = Object.assign(Object.create(lib), { modelBackend: () => throwError(() => new LibraryFailed(500, 'boom')) });
      const { store } = setup('default', failing);
      await store.load();
      expect(store.status()).toBe('ready');
      expect(store.backend()).toBeNull();
    });
  });

  describe('install by backend and parts', () => {
    it('plans the backend in use by default and the other one when asked, without choosing it', async () => {
      const { store } = setup('noservice');
      await store.load();
      expect((await store.plan('triposr'))?.parts).toEqual(['service', 'weights']);
      const docker = await store.plan('triposr', { backend: 'docker' });
      expect(docker?.backend).toBe('docker');
      expect(docker?.parts).toEqual(['weights']);
      expect(store.backend()?.backend).toBe('dotnet');
    });

    it('sends the chosen parts, follows the job through each part and ends with the engines read again', async () => {
      const { store, lib } = setup('noservice');
      await store.load();
      await store.confirmInstall('triposr', { parts: ['service', 'weights'] });
      expect(lib.calls).toContain('install triposr service+weights');
      expect(store.jobs()['triposr'].part).toBe('service');
      await until(() => store.jobs()['triposr'].state === 'done');
      expect(store.jobs()['triposr'].log).toEqual(['service: done', 'weights: done']);
      expect(store.engines()['triposr'].reason).toBe('not_running');
    });

    it('keeps the server’s refusal of a part the backend does not have', async () => {
      const { store } = setup('noservice');
      await store.load();
      expect(await store.plan('triposr', { backend: 'docker', parts: ['service'] })).toBeNull();
      expect(store.problems()['triposr']).toContain('not service');
    });

    it('refuses the weights of sf3d without the saved key, whatever the backend, before anything is downloaded; the service alone is planned', async () => {
      const { store } = setup('noservice');
      await store.load();
      for (const backend of ['dotnet', 'docker'] as const) {
        expect(await store.plan('sf3d', { backend })).toBeNull();
        expect(store.problems()['sf3d']).toContain('Hugging Face key');
      }
      expect((await store.plan('sf3d', { backend: 'dotnet', parts: ['service'] }))?.parts).toEqual(['service']);
      // the image (a `docker build`) is TripoSR's only
      expect(await store.plan('sf3d', { backend: 'docker', parts: ['image'] })).toBeNull();
      expect(store.problems()['sf3d']).toContain('not image');
    });
  });
});
