import { TestBed } from '@angular/core/testing';
import { ApiClient } from '@lab/api-client';

import { InMemoryAnimation } from './animation/in-memory.adapter';
import { ServerAnimation } from './animation/server.adapter';
import { ANIMATION, IN_MEMORY_ANIMATION } from './animation/tokens';
import { LanguageService } from './core/language';
import { provideMusicMotion } from './provide-music-motion';
import { stubStorage } from '../testing/memory-storage';

describe('provideMusicMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('speaks English when the host gave no language', () => {
    expect(TestBed.inject(LanguageService).lang).toBe('en');
  });

  it('gives the screens the language of the host', () => {
    TestBed.configureTestingModule({ providers: [provideMusicMotion({ lang: 'es', client: 'dashboard-full' })] });
    expect(TestBed.inject(LanguageService).lang).toBe('es');
  });

  it('talks to the server through the API client by default', () => {
    TestBed.configureTestingModule({ providers: [provideMusicMotion({ lang: 'en', client: 'dashboard-full' }), { provide: ApiClient, useValue: {} }] });
    expect(TestBed.inject(ANIMATION)).toBeInstanceOf(ServerAnimation);
  });

  it('keeps the pieces in the browser when the host asks for the in-memory adapter', () => {
    stubStorage();
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    TestBed.configureTestingModule({ providers: [provideMusicMotion({ lang: 'en', client: 'video-anim', memory: true })] });
    expect(TestBed.inject(ANIMATION)).toBeInstanceOf(InMemoryAnimation);
  });

  it('gives the in-memory adapter to the sample only when the host asked for it', () => {
    stubStorage();
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    TestBed.configureTestingModule({ providers: [provideMusicMotion({ lang: 'en', client: 'video-anim', memory: true })] });
    expect(TestBed.inject(IN_MEMORY_ANIMATION)).toBe(TestBed.inject(ANIMATION));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideMusicMotion({ lang: 'en', client: 'dashboard-full' }), { provide: ApiClient, useValue: {} }] });
    expect(TestBed.inject(IN_MEMORY_ANIMATION)).toBeNull();
  });
});
