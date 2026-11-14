import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnimationFailure, type AnimationPort } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { map, throwError } from 'rxjs';

import { MOTION_EDIT_BASE, MOTION_EDIT_OPTIONS } from '../../../core/options';
import { FlowStore } from '../../flow.store';
import { ASSIST_PROVIDERS } from '@lab/assist-kit';
import { FakeProviders, flowWithPiece, memoryFlowStore, settle, testPlan } from '../../flow.testing';
import { DesignCard } from './design-card';

async function create(options: { port?: (real: InMemoryAnimation) => AnimationPort; model?: string; provider?: string; auto?: boolean; lang?: 'es' | 'en' } = {}) {
  const real = new InMemoryAnimation();
  const animation = options.port ? options.port(real) : real;
  const store = memoryFlowStore();
  const plan = testPlan();
  if (options.model) plan.animation.model = options.model;
  if (options.provider) plan.animation.provider = options.provider;
  const pieceId = await flowWithPiece(store, real, plan);
  if (options.auto) store.setAuto('design', true);
  const propose = vi.spyOn(animation, 'propose');
  TestBed.configureTestingModule({
    providers: [
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } },
      { provide: MOTION_EDIT_BASE, useValue: '/motion-edit' },
      provideRouter([]),
      provideLabForms({ lang: options.lang ?? 'en' }),
      { provide: ASSIST_PROVIDERS, useValue: new FakeProviders() },
      { provide: FlowStore, useValue: store },
      { provide: ANIMATION, useValue: animation },
    ],
  });
  const fixture = TestBed.createComponent(DesignCard);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  return { fixture, el, get, click, store, propose, pieceId };
}

describe('DesignCard', () => {
  it('proposes the design with the plan prompt and model, and shows what was sent', async () => {
    const { get, propose, store, pieceId } = await create({ model: 'qwen3:8b' });
    expect(propose).toHaveBeenCalledWith(pieceId, { what: 'design', prompt: 'a neon track', model: 'qwen3:8b' });
    expect(store.flow()?.steps.design.status).toBe('waiting');
    expect(get('sent')!.textContent).toContain('a neon track');
    expect(get('sent')!.textContent).toContain('qwen3:8b');
  });

  it('sends the run\'s provider with the proposal, and none when there is none', async () => {
    const withProvider = await create({ provider: 'router', model: 'gpt-x' });
    expect(withProvider.propose).toHaveBeenCalledWith(withProvider.pieceId, { what: 'design', prompt: 'a neon track', model: 'gpt-x', provider: 'router' });
    expect(withProvider.get('sent')!.textContent).toContain('of the provider router');
    TestBed.resetTestingModule();
    const without = await create();
    expect('provider' in (without.propose.mock.calls[0][1] as object)).toBe(false);
  });

  it('says where the design came from: the fixed rule with its reason, or the assistant with its model', async () => {
    const rule = await create();
    expect(rule.get('source')!.textContent).toContain('fixed rule');
    TestBed.resetTestingModule();
    const assistant = await create({
      port: (real) => Object.assign(Object.create(real), { propose: (id: string, input: never) => real.propose(id, input).pipe(map((p) => ({ ...p, source: 'assistant' as const, fallbackReason: undefined, model: 'qwen3:8b' }))) }),
    });
    expect(assistant.get('source')!.textContent).toContain('Written by the assistant (qwen3:8b)');
  });

  it('shows the design: concept, colours and fonts', async () => {
    const { get } = await create();
    expect(get('design-summary')).not.toBeNull();
    expect(get('design-colours')!.textContent).toMatch(/#/);
    expect(get('design-fonts')!.textContent).toContain('Fonts');
  });

  it('proposes again with another prompt and model, for this call only', async () => {
    const { el, get, click, propose, pieceId, fixture } = await create();
    await click('again-open');
    const prompt = el.querySelector<HTMLTextAreaElement>('app-propose-again textarea')!;
    prompt.value = 'warmer, more orange';
    prompt.dispatchEvent(new Event('input'));
    await settle(fixture);
    await click('again-submit');
    expect(propose).toHaveBeenLastCalledWith(pieceId, { what: 'design', prompt: 'warmer, more orange' });
    expect(get('sent')!.textContent).toContain('warmer, more orange');
    expect(get('propose-again')).toBeNull();
  });

  it('links to the editor on the piece with the Flow bar parameters', async () => {
    const { get, store, pieceId } = await create();
    const href = get('edit-in-editor')!.getAttribute('href')!;
    expect(href).toBe(`/motion-edit/pieces/${pieceId}?flow=${store.flow()!.id}&step=design`);
  });

  it('Continue goes on to the script, and the switch lets it run through', async () => {
    const first = await create();
    await first.click('continue');
    expect(first.store.flow()?.current).toBe('script');
    TestBed.resetTestingModule();
    const auto = await create({ auto: true });
    expect(auto.store.flow()?.current).toBe('script');
    expect(auto.store.flow()?.steps.design.status).toBe('done');
  });

  it('sets the switch from the review', async () => {
    const { get, store } = await create();
    (get('auto') as HTMLInputElement).click();
    expect(store.flow()?.autoContinue.design).toBe(true);
  });

  it('fails with the reason, and Retry asks again', async () => {
    const { get, click, store, propose } = await create({ port: (real) => Object.assign(Object.create(real), { propose: () => throwError(() => new AnimationFailure('refused', 'the model refused')) }) });
    expect(store.flow()?.steps.design).toMatchObject({ status: 'failed', reason: 'the model refused' });
    expect(get('failed')!.textContent).toContain('the model refused');
    await click('retry');
    expect(propose).toHaveBeenCalledTimes(2);
  });

  it('says the server is busy and keeps trying while the card is visible', async () => {
    const { get, store } = await create({ port: (real) => Object.assign(Object.create(real), { propose: () => throwError(() => new AnimationFailure('busy', 'drawing')) }) });
    expect(store.flow()?.steps.design.status).toBe('running');
    expect(get('busy')!.textContent).toContain('drawing something else');
  });

  it('speaks Spanish when the host does', async () => {
    const { get } = await create({ lang: 'es' });
    expect(get('sent')!.textContent).toContain('Enviado al servidor');
  });
});
