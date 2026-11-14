import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnimationFailure, type AnimationPort } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { throwError } from 'rxjs';

import { MOTION_EDIT_BASE, MOTION_EDIT_OPTIONS } from '../../../core/options';
import { FlowStore } from '../../flow.store';
import { ASSIST_PROVIDERS } from '@lab/assist-kit';
import { FakeProviders, flowWithPiece, memoryFlowStore, settle, testPlan } from '../../flow.testing';
import { ScriptCard } from './script-card';

async function create(options: { port?: (real: InMemoryAnimation) => AnimationPort; stale?: boolean; lang?: 'es' | 'en' } = {}) {
  const real = new InMemoryAnimation();
  const animation = options.port ? options.port(real) : real;
  const store = memoryFlowStore();
  const pieceId = await flowWithPiece(store, real, testPlan());
  store.run('design');
  store.complete('design', {});
  if (options.stale) {
    // a script that was written, then the person went back to Design
    store.continue();
    store.run('script');
    store.complete('script', { what: 'script', source: 'fallback', prompt: 'a neon track', askedModel: '', replacements: 0, script: { pieces: 3, lines: 4 } });
    store.back('design');
    store.run('design');
    store.complete('design', {});
    store.continue();
  } else store.continue();
  const propose = vi.spyOn(animation, 'propose');
  TestBed.configureTestingModule({
    providers: [
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } },
      { provide: MOTION_EDIT_BASE, useValue: '' },
      provideRouter([]),
      provideLabForms({ lang: options.lang ?? 'en' }),
      { provide: ASSIST_PROVIDERS, useValue: new FakeProviders() },
      { provide: FlowStore, useValue: store },
      { provide: ANIMATION, useValue: animation },
    ],
  });
  const fixture = TestBed.createComponent(ScriptCard);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  return { fixture, el, get, click, store, propose, pieceId };
}

describe('ScriptCard', () => {
  it('proposes the script with the plan prompt and shows what was sent and who wrote it', async () => {
    const { get, propose, pieceId, store } = await create();
    expect(propose).toHaveBeenCalledWith(pieceId, { what: 'script', prompt: 'a neon track' });
    expect(store.flow()?.steps.script.status).toBe('waiting');
    expect(get('sent')!.textContent).toContain('a neon track');
    expect(get('source')!.textContent).toContain('fixed rule');
    expect(get('script-summary')!.textContent).toMatch(/\d+ pieces/);
  });

  it('has no switch: the script always stops', async () => {
    const { get } = await create();
    expect(get('auto')).toBeNull();
  });

  it('the review is the editor: its main action opens the piece with the Flow bar parameters', async () => {
    const { get, store, pieceId } = await create();
    expect(get('open-script')!.getAttribute('href')).toBe(`/pieces/${pieceId}?flow=${store.flow()!.id}&step=script`);
  });

  it('Continue goes on to the parts, or to the render when none are wanted', async () => {
    const { click, store } = await create();
    await click('continue');
    expect(store.flow()?.current).toBe('render');
    expect(store.flow()?.steps.parts.status).toBe('skipped');
  });

  it('proposes again with another prompt', async () => {
    const { el, click, propose, pieceId, fixture } = await create();
    await click('again-open');
    const prompt = el.querySelector<HTMLTextAreaElement>('app-propose-again textarea')!;
    prompt.value = 'fewer words';
    prompt.dispatchEvent(new Event('input'));
    await settle(fixture);
    await click('again-submit');
    expect(propose).toHaveBeenLastCalledWith(pieceId, { what: 'script', prompt: 'fewer words' });
  });

  it('after going back to Design it offers to keep the script or propose it again, and keeping puts it in review', async () => {
    const { get, click, store, propose } = await create({ stale: true });
    expect(get('stale')).not.toBeNull();
    expect(propose).not.toHaveBeenCalled();
    await click('keep');
    expect(store.flow()?.steps.script.status).toBe('waiting');
    expect(get('script-summary')!.textContent).toContain('3 pieces');
  });

  it('fails with the reason and Retry asks again', async () => {
    const { get, click, propose } = await create({ port: (real) => Object.assign(Object.create(real), { propose: () => throwError(() => new AnimationFailure('refused', 'too long')) }) });
    expect(get('failed')!.textContent).toContain('too long');
    await click('retry');
    expect(propose).toHaveBeenCalledTimes(2);
  });

  it('speaks Spanish when the host does', async () => {
    const { get } = await create({ lang: 'es' });
    expect(get('sent')!.textContent).toContain('Enviado al servidor');
  });
});
