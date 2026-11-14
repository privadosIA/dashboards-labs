import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionEditor } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';
import { firstValueFrom, of } from 'rxjs';

import { stubStorage } from '../../testing/memory-storage';
import { MOTION_EDIT_BASE, MOTION_EDIT_OPTIONS } from '../core/options';
import { AUDIO_FACTORY } from './audio';
import { MONACO } from './code/code-pane/code-pane';
import { EditorPage } from './editor.page';

class FakeAudio {
  currentTime = 0;
  paused = true;
  play = () => ((this.paused = false), Promise.resolve());
  pause = () => void (this.paused = true);
  addEventListener = () => undefined;
  removeEventListener = () => undefined;
}

async function setup(query: Record<string, string>, base = '') {
  stubStorage();
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10 });
  await firstValueFrom(port.loadSample());
  TestBed.configureTestingModule({
    providers: [
      { provide: MONACO, useValue: () => Promise.reject(new Error('no monaco in tests')) },
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en' } },
      { provide: MOTION_EDIT_BASE, useValue: base },
      provideRouter([]),
      provideHttpClient(),
      provideServerConnection({ lang: 'en' }),
      provideLabForms({ lang: 'en' }),
      provideMotionParts({ lang: 'en' }),
      provideMotionEditor({ lang: 'en' }),
      { provide: ANIMATION, useValue: port },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'sample-piece' })), queryParamMap: of(convertToParamMap(query)) } },
      { provide: AUDIO_FACTORY, useValue: () => new FakeAudio() },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(EditorPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = (check: () => void) => vi.waitFor(() => (fixture.detectChanges(), check()), { timeout: 2000 });
  await settle(() => expect(el.querySelector('h1')).not.toBeNull());
  return { fixture, el, port, navigate, settle };
}

describe('EditorPage opened from a guided flow', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has no Flow bar when it is opened on its own', async () => {
    const { el } = await setup({});
    expect(el.querySelector('[data-testid="flow-bar"]')).toBeNull();
  });

  it('shows the Flow bar with the step and a way back to the flow when ?flow= is there', async () => {
    const { el } = await setup({ flow: 'flow-1', step: 'script' }, '/motion-edit');
    expect(el.querySelector('[data-testid="flow-bar-step"]')!.textContent).toContain('Script');
    expect(el.querySelector('[data-testid="flow-bar-back"]')!.getAttribute('href')).toBe('/motion-edit/flow/flow-1');
    expect(el.querySelector('h1')!.textContent).toBe('Sample Beat');
  });

  it('says Design when the step is the design', async () => {
    const { el } = await setup({ flow: 'flow-1', step: 'design' });
    expect(el.querySelector('[data-testid="flow-bar-step"]')!.textContent).toContain('Design');
  });

  it('Continue with nothing unsaved returns to the flow asking it to continue that step', async () => {
    const { el, navigate } = await setup({ flow: 'flow-1', step: 'script' }, '/motion-edit');
    (el.querySelector('[data-testid="flow-bar-continue"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/motion-edit/flow', 'flow-1'], { queryParams: { continue: 'script' } }));
  });

  it('Continue saves what is unsaved first, and then returns to the flow', async () => {
    const { fixture, el, port, navigate, settle } = await setup({ flow: 'flow-1', step: 'script' });
    const page = fixture.componentInstance as unknown as { store: () => { apply: (fn: (doc: { design: Record<string, unknown> }) => unknown) => void }; dirty: () => boolean };
    page.store().apply((doc) => ({ ...doc, design: { ...doc.design, concept: 'changed in the flow' } }));
    fixture.detectChanges();
    expect(page.dirty()).toBe(true);
    expect(el.querySelector('[data-testid="flow-bar-unsaved"]')).not.toBeNull();
    (el.querySelector('[data-testid="flow-bar-continue"]') as HTMLButtonElement).click();
    await settle(() => expect(navigate).toHaveBeenCalled());
    expect((await firstValueFrom(port.piece('sample-piece'))).design.design.concept).toBe('changed in the flow');
  });

  it('stays in the editor when the save is refused', async () => {
    const { fixture, el, port, navigate, settle } = await setup({ flow: 'flow-1', step: 'script' });
    vi.spyOn(port, 'saveDesign').mockImplementation(() => { throw new Error('refused'); });
    const page = fixture.componentInstance as unknown as { store: () => { apply: (fn: (doc: { design: Record<string, unknown> }) => unknown) => void } };
    page.store().apply((doc) => ({ ...doc, design: { ...doc.design, concept: 'x' } }));
    fixture.detectChanges();
    (el.querySelector('[data-testid="flow-bar-continue"]') as HTMLButtonElement).click();
    await settle(() => expect((fixture.componentInstance as unknown as { refusedDesign: () => string }).refusedDesign()).toBe('refused'));
    expect(navigate).not.toHaveBeenCalled();
  });
});
