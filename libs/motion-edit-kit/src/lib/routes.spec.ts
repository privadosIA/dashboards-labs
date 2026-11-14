import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionParts } from '@lab/motion-parts';
import { provideMusicStudio } from '@lab/music-studio-kit';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';
import { firstValueFrom } from 'rxjs';

import { stubStorage } from '../testing/memory-storage';
import { AUDIO_FACTORY } from './editor/audio';
import { MotionEditNav } from './nav/motion-edit-nav';
import { provideMotionEdit } from './provide-motion-edit';
import { motionEditRoutes } from './routes';

/** The base the host of the test mounts the routes at: the nav it draws links from it. */
let mountedAt = '';

@Component({ imports: [MotionEditNav, RouterOutlet], template: `<motion-edit-nav [base]="base" /><router-outlet />` })
class Host {
  readonly base = mountedAt;
}

class FakeAudio {
  currentTime = 0;
  paused = true;
  play = () => ((this.paused = false), Promise.resolve());
  pause = () => void (this.paused = true);
  addEventListener = () => undefined;
  removeEventListener = () => undefined;
}

/** The library with everything provided at the root, as the hosts do (the nav and the language read it from there), mounted at `base`. */
async function mount(base: string, lang: 'es' | 'en' = 'en', songs = false) {
  mountedAt = base;
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10 });
  await firstValueFrom(port.loadSample());
  const routes: Routes = base === '' ? motionEditRoutes() : [{ path: base.slice(1), children: motionEditRoutes({ base }) }];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '', component: Host, children: routes }]),
      provideHttpClient(),
      provideServerConnection({ lang }),
      provideLabForms({ lang }),
      provideMotionParts({ lang }),
      provideMotionEdit({ lang, memory: true }),
      ...(songs ? [provideMusicStudio({ lang, memory: true })] : []),
      { provide: ANIMATION, useValue: port },
      { provide: AUDIO_FACTORY, useValue: () => new FakeAudio() },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(base === '' ? '/' : `${base}/pieces`);
  const el = harness.routeNativeElement as HTMLElement;
  const settle = () =>
    vi.waitFor(() => {
      harness.detectChanges();
    });
  return { harness, el, settle, router: TestBed.inject(Router), q: (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`) };
}

describe('motionEditRoutes', () => {
  beforeEach(() => stubStorage());
  afterEach(() => vi.unstubAllGlobals());

  it('mounted at the root: the root leads to the list, a piece opens at /pieces/<id>, Back returns, and the nav marks the list', async () => {
    const { el, q, settle, router, harness } = await mount('');
    await settle();
    expect(router.url).toBe('/pieces');
    expect(el.querySelector('app-pieces-page')).not.toBeNull();
    expect(q('nav-pieces')!.getAttribute('href')).toBe('/pieces');
    expect(q('nav-pieces')!.classList.contains('active')).toBe(true);
    expect(q('nav-flow')!.getAttribute('href')).toBe('/flow');
    expect(q('nav-flow')!.textContent).toBe('Guided flow');
    el.querySelector<HTMLButtonElement>('.open')!.click();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(router.url).toBe('/pieces/sample-piece');
      expect(el.querySelector('h1')?.textContent).toBe('Sample Beat');
    });
    expect(el.querySelector('a.back')!.getAttribute('href')).toBe('/pieces');
  });

  it('mounted under /motion-edit: the list, opening a piece and Back all stay under it, and the nav links there', async () => {
    const { el, q, settle, router, harness } = await mount('/motion-edit');
    await settle();
    expect(router.url).toBe('/motion-edit/pieces');
    expect(q('nav-pieces')!.getAttribute('href')).toBe('/motion-edit/pieces');
    expect(q('nav-flow')!.getAttribute('href')).toBe('/motion-edit/flow');
    expect(q('guided-flow')!.getAttribute('href')).toBe('/motion-edit/flow');
    el.querySelector<HTMLButtonElement>('.open')!.click();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(router.url).toBe('/motion-edit/pieces/sample-piece');
      expect(el.querySelector('h1')?.textContent).toBe('Sample Beat');
    });
    expect(el.querySelector('a.back')!.getAttribute('href')).toBe('/motion-edit/pieces');
  });

  it('the root of a section leads to its list', async () => {
    const { harness, settle, router } = await mount('/motion-edit');
    await harness.navigateByUrl('/motion-edit');
    await settle();
    expect(router.url).toBe('/motion-edit/pieces');
  });

  it('speaks the language the host gave the provider: the list and the nav, and not English by default', async () => {
    const { q, el, settle } = await mount('', 'es');
    await settle();
    expect(q('nav-pieces')!.textContent).toBe('Piezas');
    expect(el.querySelector('h1')!.textContent).toContain('Piezas');
  });

  it('says what is missing when the port is not provided', async () => {
    const { el } = await mount('', 'es');
    expect(el.querySelector('app-pieces-page')).not.toBeNull();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '', children: motionEditRoutes() }]), provideMotionEdit({ lang: 'en' })] });
    const missing = RouterTestingHarness.create('/pieces');
    await expect(missing).rejects.toThrow(/provideMusicMotion/);
  });

  it('opens the flow at /flow and at /flow/<id> when the song port is provided, under the section too', async () => {
    const { harness, settle, router, el } = await mount('/motion-edit', 'en', true);
    await harness.navigateByUrl('/motion-edit/flow');
    await settle();
    expect(router.url).toBe('/motion-edit/flow');
    expect(el.querySelector('app-flow-page')).not.toBeNull();
    await harness.navigateByUrl('/motion-edit/flow/some-id');
    await settle();
    expect(el.querySelector('app-flow-page')).not.toBeNull();
  });

  it('keeps the list of pieces working with no song port, and says what is missing only when the flow is opened', async () => {
    const { el, settle, harness } = await mount('');
    await settle();
    expect(el.querySelector('app-pieces-page')).not.toBeNull();
    await expect(harness.navigateByUrl('/flow')).rejects.toThrow(/provideMusicStudio/);
  });

  it('the guard of the editor is in the table: leaving a piece with changes asks first', async () => {
    const { screens } = await import('./screens');
    const piece = screens[0].children!.find((r) => r.path === 'pieces/:id')!;
    expect(piece.canDeactivate).toHaveLength(1);
    expect(motionEditRoutes()[0].loadChildren).toBeDefined();
  });
});
