import { TestBed } from '@angular/core/testing';
import { AnimationFailure, type AnimationPort } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';
import { firstValueFrom, throwError } from 'rxjs';

import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { FlowStore } from '../../flow.store';
import { flowWithPiece, memoryFlowStore, settle, testPlan } from '../../flow.testing';
import { DRAFT_POLL, PartsCard } from './parts-card';

type Setup = { parts?: { name: string; request: string }[]; port?: (real: InMemoryAnimation) => AnimationPort; model?: string; provider?: string; auto?: boolean; lang?: 'es' | 'en' };

async function create(options: Setup = {}) {
  const real = new InMemoryAnimation({ writeMs: 20 });
  const animation = options.port ? options.port(real) : real;
  const store = memoryFlowStore();
  const plan = testPlan(options.parts ?? [{ name: 'year-counter', request: 'a counter that rolls through years' }]);
  if (options.model) plan.animation.model = options.model;
  if (options.provider) plan.animation.provider = options.provider;
  await flowWithPiece(store, real, plan);
  for (const step of ['design', 'script'] as const) {
    store.run(step);
    store.complete(step, {});
    store.continue();
  }
  if (options.auto) store.setAuto('parts', true);
  const askDraft = vi.spyOn(animation, 'askDraft');
  TestBed.configureTestingModule({
    providers: [
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } },
      provideLabForms({ lang: options.lang ?? 'en' }),
      { provide: FlowStore, useValue: store },
      { provide: ANIMATION, useValue: animation },
      { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } },
      { provide: DRAFT_POLL, useValue: 10 },
    ],
  });
  const fixture = TestBed.createComponent(PartsCard);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  const ready = () =>
    vi.waitFor(async () => {
      await settle(fixture);
      expect(store.flow()?.steps.parts.status).toBe('waiting');
    });
  return { fixture, el, get, click, store, animation: real, askDraft, ready };
}

describe('PartsCard', () => {
  it('asks the assistant for a draft of each wanted part the catalog lacks, with the plan model, and follows it until it is ready', async () => {
    const { get, store, askDraft, ready } = await create({ model: 'qwen3:8b' });
    expect(askDraft).toHaveBeenCalledWith({ request: 'a counter that rolls through years', model: 'qwen3:8b' });
    expect(get('sent')!.textContent).toContain('1 part drafts');
    await ready();
    expect(get('part-year-counter')!.getAttribute('data-status')).toBe('ready');
    expect(store.flow()?.refs.drafts['year-counter']).toBeTruthy();
  });

  it('sends the run\'s provider with every draft, also when it is asked again', async () => {
    const { el, click, askDraft, ready, fixture } = await create({ model: 'qwen3:8b', provider: 'router' });
    expect(askDraft).toHaveBeenCalledWith({ request: 'a counter that rolls through years', model: 'qwen3:8b', provider: 'router' });
    await ready();
    await click('ask-again');
    const box = el.querySelector<HTMLTextAreaElement>('[data-testid="ask-form"] textarea')!;
    box.value = 'a counter that rolls through decades';
    box.dispatchEvent(new Event('input'));
    await settle(fixture);
    await click('ask-submit');
    expect(askDraft).toHaveBeenLastCalledWith({ request: 'a counter that rolls through decades', model: 'qwen3:8b', provider: 'router' });
  });

  it('lists a part the catalog already has as already there, and drafts nothing for it', async () => {
    const { get, askDraft, ready } = await create({ parts: [{ name: 'counter', request: 'a counter' }] });
    await ready();
    expect(get('there')).not.toBeNull();
    expect(askDraft).not.toHaveBeenCalled();
  });

  it('approves a draft: the part is in the catalog and the review suggests going back to the Script once', async () => {
    const { get, click, store, animation, ready, fixture } = await create();
    await ready();
    await click('approve');
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(get('approved')).not.toBeNull();
    });
    const catalog = await firstValueFrom(animation.catalog());
    expect(catalog.parts.some((p) => get('approved')!.textContent!.includes(`"${p.name}"`))).toBe(true);
    expect(get('suggest')).not.toBeNull();
    await click('back-to-script');
    expect(store.flow()?.current).toBe('script');
    expect(store.flow()?.steps.parts.status).toBe('waiting');
    expect((store.flow()?.steps.parts.result as { suggested?: boolean }).suggested).toBe(true);
  });

  it('drops a draft: it is removed on the server and the part is left out', async () => {
    const { get, click, animation, ready, fixture } = await create();
    await ready();
    expect((await firstValueFrom(animation.drafts())).length).toBe(1);
    await click('drop');
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(get('dropped')).not.toBeNull();
    });
    expect((await firstValueFrom(animation.drafts())).length).toBe(0);
  });

  it('asks again with an edited request: a new draft replaces the old one', async () => {
    const { el, get, click, animation, askDraft, ready, fixture, store } = await create();
    await ready();
    const first = store.flow()!.refs.drafts['year-counter'];
    await click('ask-again');
    const box = el.querySelector<HTMLTextAreaElement>('[data-testid="ask-form"] textarea')!;
    box.value = 'a counter that rolls through decades';
    box.dispatchEvent(new Event('input'));
    await settle(fixture);
    await click('ask-submit');
    expect(askDraft).toHaveBeenLastCalledWith({ request: 'a counter that rolls through decades' });
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(get('part-year-counter')!.getAttribute('data-status')).toBe('ready');
    });
    expect(store.flow()?.refs.drafts['year-counter']).not.toBe(first);
    expect((await firstValueFrom(animation.drafts())).map((d) => d.id)).not.toContain(first);
  });

  it('fails the step when every draft failed, with the reason, and offers Retry and Skip', async () => {
    const { get, store, click } = await create({ parts: [{ name: 'broken', request: 'this one will fail' }] });
    await vi.waitFor(() => expect(store.flow()?.steps.parts.status).toBe('failed'));
    expect(get('failed')).not.toBeNull();
    expect(get('retry')).not.toBeNull();
    await click('skip');
    expect(store.flow()?.steps.parts.status).toBe('skipped');
    expect(store.flow()?.current).toBe('render');
  });

  it('shows a refused request as the failure of the step', async () => {
    const { store } = await create({ port: (real) => Object.assign(Object.create(real), { askDraft: () => throwError(() => new AnimationFailure('refused', 'the model is not installed')) }) });
    await vi.waitFor(() => expect(store.flow()?.steps.parts).toMatchObject({ status: 'failed', reason: 'the model is not installed' }));
  });

  it('Continue goes on to the render; with the switch it runs through', async () => {
    const first = await create();
    await first.ready();
    await first.click('continue');
    expect(first.store.flow()?.current).toBe('render');
    TestBed.resetTestingModule();
    const auto = await create({ auto: true });
    await vi.waitFor(() => expect(auto.store.flow()?.current).toBe('render'));
    expect(auto.store.flow()?.steps.parts.status).toBe('done');
  });

  it('speaks Spanish when the host does', async () => {
    const { get } = await create({ lang: 'es' });
    expect(get('sent')!.textContent).toContain('Enviado al servidor');
  });
});
