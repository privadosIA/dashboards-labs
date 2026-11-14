import { TestBed } from '@angular/core/testing';
import { ApiClient } from '@lab/api-client';
import { ASSIST_PROVIDERS, MemoryProviders, ServerProviders } from '@lab/assist-kit';
import { ANIMATION } from '@lab/music-motion';
import { firstValueFrom, of } from 'rxjs';

import { MOTION_EDIT_OPTIONS } from '../core/options';
import { flowProviders } from './providers';

describe('flowProviders', () => {
  it('builds the in-memory providers from the pieces\' port when the host chose memory, and the server\'s otherwise', async () => {
    const animation = { assistModels: () => of({ default: 'm1', models: [{ name: 'm1', sizeBytes: 1, fits: true }] }) };
    TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en', memory: true } }, { provide: ANIMATION, useValue: animation }, flowProviders] });
    const memory = TestBed.inject(ASSIST_PROVIDERS);
    expect(memory).toBeInstanceOf(MemoryProviders);
    expect(await firstValueFrom(memory.models('ollama'))).toEqual(['m1']);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en' } }, { provide: ApiClient, useValue: {} }, flowProviders] });
    expect(TestBed.inject(ASSIST_PROVIDERS)).toBeInstanceOf(ServerProviders);
  });

  it('is not at the root: a host that has not opened the flow\'s routes has none', () => {
    TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en' } }] });
    expect(() => TestBed.inject(ASSIST_PROVIDERS)).toThrow();
  });
});
