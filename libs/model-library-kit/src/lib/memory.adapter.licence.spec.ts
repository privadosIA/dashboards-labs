import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { InMemoryModelLibrary } from './memory.adapter';
import { LibraryFailed } from './port';

const failure = async (o: Parameters<typeof firstValueFrom>[0]): Promise<LibraryFailed> => (await firstValueFrom(o).catch((e) => e)) as LibraryFailed;

describe('InMemoryModelLibrary: the licence that needs an acceptance', () => {
  it('describes the licence of each engine as an object, with `accepted` only where an acceptance is required', async () => {
    const lib = new InMemoryModelLibrary({ sf3dKey: true });
    const sf3d = await firstValueFrom(lib.installPlan('sf3d'));
    expect(sf3d.licence).toBe('Stability AI Community License');
    expect(sf3d.licenceTerms).toMatchObject({ id: 'stability-community', commercial: 'conditions', accepted: false });
    const bare = new InMemoryModelLibrary({ service: 'bare' });
    const triposr = await firstValueFrom(bare.installPlan('triposr', { backend: 'dotnet', parts: ['weights'] }));
    expect(triposr.licenceTerms).toMatchObject({ name: 'MIT', commercial: 'yes' });
    expect(triposr.licenceTerms).not.toHaveProperty('id');
    expect(triposr.licenceTerms).not.toHaveProperty('accepted');
  });

  it('refuses the install of sf3d without the acceptance, or with another id, and starts nothing', async () => {
    const lib = new InMemoryModelLibrary({ sf3dKey: true });
    const without = await failure(lib.startInstall('sf3d'));
    expect([without.status, without.reason]).toEqual([400, 'licence_acceptance_required']);
    expect(without.said).toContain('stability-community');
    expect((await failure(lib.startInstall('sf3d', { acceptLicence: 'other' }))).reason).toBe('licence_acceptance_required');
    expect((await firstValueFrom(lib.installPlan('sf3d'))).licenceTerms?.accepted).toBe(false);
  });

  it('starts the install with the matching id and records the acceptance: the next plan says so', async () => {
    const lib = new InMemoryModelLibrary({ sf3dKey: true });
    const job = await firstValueFrom(lib.startInstall('sf3d', { acceptLicence: 'stability-community' }));
    expect(job.engine).toBe('sf3d');
    expect(job.state).toBe('running');
    expect((await firstValueFrom(lib.installPlan('sf3d'))).licenceTerms?.accepted).toBe(true);
  });

  it('does not ask for it for an engine whose licence has no id', async () => {
    const lib = new InMemoryModelLibrary({ service: 'bare' });
    const job = await firstValueFrom(lib.startInstall('triposr', { backend: 'dotnet', parts: ['weights'] }));
    expect(job.engine).toBe('triposr');
  });

  it('keeps the refusal for the key before the one for the licence, as the server checks them', async () => {
    const lib = new InMemoryModelLibrary();
    const refused = await failure(lib.startInstall('sf3d'));
    expect(refused.reason).toBe('key_missing');
  });
});
