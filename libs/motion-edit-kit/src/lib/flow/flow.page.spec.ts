import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, IN_MEMORY_ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { SONGS } from '@lab/music-studio-kit';
import { provideServerConnection } from '@lab/server-connection';

import { stubStorage } from '../../testing/memory-storage';
import { MOTION_EDIT_OPTIONS } from '../core/options';
import { motionEditRoutes } from '../routes';
import { FakeSongs, testPlan } from './flow.testing';
import { FlowStorage } from './flow.storage';
import { FlowStore } from './flow.store';

/** The flow routes mounted at the root with the in-memory animation and a song port the spec drives, and some flows already kept in the browser's storage. */
async function mount(options: { lang?: 'es' | 'en'; keep?: (store: FlowStore, animation: InMemoryAnimation) => Promise<void> | void; url?: (store: FlowStore) => string } = {}) {
  const storage = stubStorage();
  const animation = new InMemoryAnimation({ stepMs: 30, pollMs: 5, writeMs: 20 });
  const songs = new FakeSongs();
  const keeper = new FlowStore(new FlowStorage('motion-edit', storage));
  await options.keep?.(keeper, animation);
  keeper.close();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '', component: RouterOutletHost, children: motionEditRoutes() }]),
      provideHttpClient(),
      provideServerConnection({ lang: options.lang ?? 'en' }),
      provideLabForms({ lang: options.lang ?? 'en' }),
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en', memory: true } },
      { provide: ANIMATION, useValue: animation },
      { provide: IN_MEMORY_ANIMATION, useValue: animation },
      { provide: SONGS, useValue: songs.port() },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(options.url ? options.url(keeper) : '/flow');
  const el = harness.routeNativeElement as HTMLElement;
  const settle = () => vi.waitFor(() => harness.detectChanges());
  await settle();
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { harness, el, get, settle, animation, songs, storage, router: TestBed.inject(Router) };
}

import { Component } from '@angular/core';
@Component({ imports: [RouterOutlet], template: `<router-outlet />` })
class RouterOutletHost {}

const keepFlow = (store: FlowStore, setup?: (s: FlowStore) => void) => {
  const flow = store.start('a neon synthwave track', testPlan());
  setup?.(store);
  return flow;
};

describe('the Flow page', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('at /flow', () => {
    it('lists the kept flows and a plan card for a new one', async () => {
      const { get, el } = await mount({ keep: (s) => void keepFlow(s) });
      expect(el.querySelector('app-flow-list')).not.toBeNull();
      expect(el.querySelectorAll('[data-testid^="flow-flow-"]').length).toBe(1);
      expect(el.querySelector('app-plan-card')).not.toBeNull();
      expect(get('no-flows')).toBeNull();
    });

    it('says there are no flows when none is kept', async () => {
      const { get } = await mount();
      expect(get('no-flows')).not.toBeNull();
    });

    it('starts a flow from the plan card: the flow is kept with the default switches and its page opens', async () => {
      const { get, settle, router, storage } = await mount({ keep: (s) => { s.setDefault('map', true); } });
      const box = get('sentence') as HTMLTextAreaElement;
      box.value = 'a neon synthwave track';
      box.dispatchEvent(new Event('input'));
      await settle();
      get('make-plan')!.click();
      await vi.waitFor(() => expect(get('start')).not.toBeNull());
      get('start')!.click();
      await vi.waitFor(() => expect(router.url).toMatch(/^\/flow\/flow-/));
      const kept = JSON.parse(storage.getItem('motion-edit.flows')!) as { autoContinue: object; prompt: string }[];
      expect(kept).toHaveLength(1);
      expect(kept[0].autoContinue).toEqual({ map: true });
      expect(kept[0].prompt).toBe('a neon synthwave track');
    });
  });

  describe('at /flow/:id', () => {
    it('shows the steps as a vertical list: the current one open, the finished ones as a line with a way back, the rest waiting', async () => {
      const { get, el } = await mount({
        keep: (s) => {
          keepFlow(s, (st) => {
            st.run('song');
            st.complete('song', { title: 'Night Drive', seconds: 90, songId: 's1' });
            st.continue();
          });
        },
        url: (s) => `/flow/${s.flows()[0].id}`,
      });
      expect(el.querySelectorAll('li.step')).toHaveLength(7);
      expect(get('line-song')!.textContent).toContain('Night Drive');
      expect(get('back-song')).not.toBeNull();
      expect(get('status-song')!.textContent).toBe('Done');
      expect(el.querySelector('li.step.current')!.getAttribute('data-step')).toBe('map');
      expect(get('status-render')!.textContent).toBe('Pending');
      expect(get('prompt')!.textContent).toContain('neon synthwave');
      // a step that has not run says nothing yet
      for (const pending of ['parts', 'render', 'done']) expect(get(`line-${pending}`), pending).toBeNull();
    });

    it('Back to a finished step makes the later ones out of date', async () => {
      const { get, settle, el } = await mount({
        keep: (s) => {
          keepFlow(s, (st) => {
            st.run('song');
            st.complete('song', { title: 'Night Drive', seconds: 90, songId: 's1' });
            st.continue();
          });
        },
        url: (s) => `/flow/${s.flows()[0].id}`,
      });
      get('back-song')!.click();
      await settle();
      expect(el.querySelector('li.step.current')!.getAttribute('data-step')).toBe('song');
      // the map had begun (its card made the piece and failed for lack of a song of the library): going back makes it out of date
      expect(get('status-map')!.textContent).toBe('Out of date');
    });

    it('says there is no such flow in this browser and links to the list', async () => {
      const { get } = await mount({ url: () => '/flow/nope' });
      expect(get('missing')!.textContent).toContain('nope');
    });

    it('opens a flow whose piece was deleted on the server with its step failed and Back offered', async () => {
      const { get } = await mount({
        keep: (s) => {
          keepFlow(s, (st) => {
            st.setRefs({ libraryKey: 'x/track-1/0', pieceId: 'deleted-piece' });
            for (const step of ['song', 'map'] as const) {
              st.run(step);
              st.complete(step, { title: 'T' });
              st.continue();
            }
            st.run('design');
            st.complete('design', {});
          });
        },
        url: (s) => `/flow/${s.flows()[0].id}`,
      });
      await vi.waitFor(() => expect(get('failed-banner')).not.toBeNull());
      expect(get('failed-banner')!.textContent).toContain('no longer on the server');
      expect(get('go-back')).not.toBeNull();
    });

    it('goes on from the step the editor was on when it is opened with ?continue=', async () => {
      const { router, harness, get } = await mount({
        keep: (s) => {
          keepFlow(s, (st) => {
            st.run('song');
            st.complete('song', {});
            st.continue();
            st.run('map');
            st.complete('map', {});
            st.continue();
            st.run('design');
            st.complete('design', {});
            st.continue();
            st.run('script');
            st.complete('script', { what: 'script', source: 'fallback', prompt: 'x', askedModel: '', replacements: 0, script: { pieces: 1, lines: 0 } });
          });
        },
        url: (s) => `/flow/${s.flows()[0].id}?continue=script`,
      });
      await vi.waitFor(() => {
        harness.detectChanges();
        expect(router.url).not.toContain('continue=');
      });
      expect(get('status-script')!.textContent).toBe('Done');
      expect(get('status-parts')!.textContent).toBe('Skipped');
    });

    it('does not continue a step the flow is not on', async () => {
      const { router, harness, get } = await mount({
        keep: (s) => void keepFlow(s),
        url: (s) => `/flow/${s.flows()[0].id}?continue=script`,
      });
      await vi.waitFor(() => {
        harness.detectChanges();
        expect(router.url).not.toContain('continue=');
      });
      expect(get('status-script')!.textContent).toBe('Pending');
    });

    it('speaks Spanish when the host does', async () => {
      const { get } = await mount({ lang: 'es', keep: (s) => void keepFlow(s), url: (s) => `/flow/${s.flows()[0].id}` });
      expect(get('status-song')!.textContent).toBeTruthy();
      expect(get('all-flows')!.textContent).toContain('Ver los flujos');
    });
  });
});
