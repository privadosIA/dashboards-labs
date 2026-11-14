import { TestBed } from '@angular/core/testing';
import { ApiClient } from '@lab/api-client';

import { LanguageService } from './core/language';
import { InMemoryMotionLibrary } from './motions/in-memory.adapter';
import { ServerMotionLibrary } from './motions/server.adapter';
import { MOTION_LIBRARY } from './motions/tokens';
import { provideVideoStudio } from './provide-video-studio';
import { InMemoryImageEdit } from './retouch/in-memory.adapter';
import { ServerImageEdit } from './retouch/server.adapter';
import { IMAGE_EDIT } from './retouch/tokens';
import { InMemoryVideoEdit } from './video-edit/in-memory.adapter';
import { ServerVideoEdit } from './video-edit/server.adapter';
import { VIDEO_EDIT } from './video-edit/tokens';
import { InMemoryVideoGeneration } from './video/in-memory.adapter';
import { ServerVideoGeneration } from './video/server.adapter';
import { toRequest } from './video/server-mapping';
import { DEFAULT_SETTINGS } from './video/model';
import { VIDEO_GENERATION } from './video/tokens';

describe('provideVideoStudio', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('speaks English when the host gave no language', () => {
    expect(TestBed.inject(LanguageService).lang).toBe('en');
  });

  it('gives the studio the language of the host', () => {
    TestBed.configureTestingModule({ providers: [provideVideoStudio({ lang: 'es' })] });
    expect(TestBed.inject(LanguageService).lang).toBe('es');
  });

  it('talks to the server through the API client by default, with the four ports', () => {
    TestBed.configureTestingModule({ providers: [provideVideoStudio({ lang: 'en', client: 'dashboard-full' }), { provide: ApiClient, useValue: {} }] });
    expect(TestBed.inject(VIDEO_GENERATION)).toBeInstanceOf(ServerVideoGeneration);
    expect(TestBed.inject(VIDEO_EDIT)).toBeInstanceOf(ServerVideoEdit);
    expect(TestBed.inject(MOTION_LIBRARY)).toBeInstanceOf(ServerMotionLibrary);
    expect(TestBed.inject(IMAGE_EDIT)).toBeInstanceOf(ServerImageEdit);
  });

  it('keeps everything in the browser when the host asks for the in-memory adapters', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    TestBed.configureTestingModule({ providers: [provideVideoStudio({ lang: 'en', memory: true })] });
    expect(TestBed.inject(VIDEO_GENERATION)).toBeInstanceOf(InMemoryVideoGeneration);
    expect(TestBed.inject(VIDEO_EDIT)).toBeInstanceOf(InMemoryVideoEdit);
    expect(TestBed.inject(MOTION_LIBRARY)).toBeInstanceOf(InMemoryMotionLibrary);
    expect(TestBed.inject(IMAGE_EDIT)).toBeInstanceOf(InMemoryImageEdit);
  });

  it('puts the name the host gave itself in the requests, and the studio own one when it gave none', async () => {
    const posts: { client?: string }[] = [];
    const api = {
      get: () => {
        throw new Error('not read');
      },
      post: (_path: string, opts: { body: { client?: string } }) => {
        posts.push(opts.body);
        throw new Error('stop');
      },
      urlOf: (a: string) => a,
    };
    for (const [client, expected] of [['dashboard-full', 'dashboard-full'], [undefined, 'video-studio']] as const) {
      const port = new ServerVideoGeneration(api as unknown as ApiClient, { client });
      await new Promise((resolve) => port.create({ ...DEFAULT_SETTINGS, model: 'balanced', prompt: 'a fox' }).subscribe({ error: resolve, next: resolve }));
      expect(posts.at(-1)?.client).toBe(expected);
    }
    expect(toRequest({ ...DEFAULT_SETTINGS, prompt: 'a' }, undefined, 'x').client).toBe('x');
  });
});
