import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { setKeyframe, toPart } from '@lab/vector-editor';
import { installBBoxPolyfill, sampleDocument } from '@lab/vector-editor/testing';
import { firstValueFrom, lastValueFrom } from 'rxjs';

import { stubStorage } from '../testing/memory-storage';
import { VectorStudioNav } from './nav/vector-studio-nav';
import { provideVectorStudio } from './provide-vector-studio';
import { vectorStudioRoutes } from './routes';

const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } as unknown as Storage;
};

/** The base the host of the test mounts the routes at: the nav it draws links from it. */
let mountedAt = '';

@Component({ imports: [VectorStudioNav, RouterOutlet], template: `<vector-studio-nav [base]="base" /><router-outlet />` })
class Host {
  readonly base = mountedAt;
}

/** A part of the user's in the in-memory catalog, sent the way the editor sends it. */
async function sendPart(port: InMemoryAnimation, name: string): Promise<void> {
  const made = toPart(setKeyframe(sampleDocument(), 'tag', 'x', 0, 0), { name, description: 'A logo that turns' });
  if ('problems' in made) throw new Error(made.problems.join());
  const draft = await firstValueFrom(port.createDraftFromText(made));
  await lastValueFrom(port.approveDraft(draft.id));
}

async function mount(routes: Routes, base: string, lang: 'es' | 'en' = 'en') {
  mountedAt = base;
  const port = new InMemoryAnimation({ storage: memoryStorage() });
  await sendPart(port, 'spin-logo');
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '', component: Host, children: routes }]), provideLabForms({ lang }), provideVectorStudio({ lang, memory: true }), { provide: ANIMATION, useValue: port }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(base === '' ? '/' : `${base}/editor`);
  harness.detectChanges();
  const el = harness.routeNativeElement as HTMLElement;
  const settle = async (): Promise<void> => {
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  return { harness, el, port, settle, router: TestBed.inject(Router), q: (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`) };
}

describe('vectorStudioRoutes', () => {
  beforeAll(() => {
    installBBoxPolyfill();
    const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  beforeEach(() => stubStorage());
  afterEach(() => vi.unstubAllGlobals());

  it('mounted at the root: the root leads to the editor, the catalog is at /catalog, and the nav marks the one that is open', async () => {
    const { harness, q, settle, router } = await mount(vectorStudioRoutes(), '');
    await settle();
    expect(router.url).toBe('/editor');
    expect(q('editor-page')).not.toBeNull();
    expect(q('nav-editor')!.classList.contains('active')).toBe(true);
    expect(q('nav-editor')!.getAttribute('href')).toBe('/editor');
    await harness.navigateByUrl('/catalog');
    await settle();
    expect(q('catalog-page')).not.toBeNull();
    expect(q('nav-catalog')!.classList.contains('active')).toBe(true);
    expect(q('nav-editor')!.classList.contains('active')).toBe(false);
  });

  it('mounted under /vector: the editor at /vector/editor, the catalog at /vector/catalog, and the nav links there', async () => {
    const routes: Routes = [{ path: 'vector', children: vectorStudioRoutes({ base: '/vector' }) }];
    const { harness, q, settle, router } = await mount(routes, '/vector');
    await settle();
    expect(router.url).toBe('/vector/editor');
    expect(q('editor-page')).not.toBeNull();
    expect(q('nav-editor')!.getAttribute('href')).toBe('/vector/editor');
    expect(q('nav-catalog')!.getAttribute('href')).toBe('/vector/catalog');
    await harness.navigateByUrl('/vector/catalog');
    await settle();
    expect(q('catalog-page')).not.toBeNull();
    expect(router.url).toBe('/vector/catalog');
  });

  it('Open on a part of the catalog leaves the editor with that part, under the section too', async () => {
    const routes: Routes = [{ path: 'vector', children: vectorStudioRoutes({ base: '/vector' }) }];
    const { harness, el, q, settle, router } = await mount(routes, '/vector');
    await harness.navigateByUrl('/vector/catalog');
    await vi.waitFor(async () => {
      await settle();
      expect(el.querySelector('[data-testid="part-spin-logo"]')).not.toBeNull();
    });
    el.querySelector<HTMLElement>('[data-testid="part-spin-logo"] [data-testid="open-part"]')!.click();
    await vi.waitFor(async () => {
      await settle();
      expect(router.url).toBe('/vector/editor');
      expect(q('doc-name')).not.toBeNull();
    });
    expect((q('doc-name') as HTMLInputElement).value).not.toBe('');
  });

  it('speaks the language the host gave the provider: the editor and the nav, and not English by default', async () => {
    const { q, settle } = await mount(vectorStudioRoutes(), '', 'es');
    await settle();
    expect(q('open')!.textContent).toContain('Abrir');
    expect(q('nav-catalog')!.textContent).toBe('Catálogo');
  });

  it('the guard of the editor is in the table: leaving it with changes asks first', () => {
    const editor = vectorStudioRoutes()[0].children!.find((r) => r.path === 'editor')!;
    expect(editor.canDeactivate).toHaveLength(1);
  });
});
