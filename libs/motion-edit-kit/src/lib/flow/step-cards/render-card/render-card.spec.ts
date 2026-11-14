import { TestBed } from '@angular/core/testing';
import { AnimationFailure, type AnimationPort } from '@lab/animation-core';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';
import { throwError } from 'rxjs';

import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { FlowStore } from '../../flow.store';
import { flowWithPiece, memoryFlowStore, settle, testPlan } from '../../flow.testing';
import { RenderCard } from './render-card';

async function create(options: { port?: (real: InMemoryAnimation) => AnimationPort; lang?: 'es' | 'en' } = {}) {
  const real = new InMemoryAnimation({ stepMs: 30, pollMs: 5 });
  const animation = options.port ? options.port(real) : real;
  const store = memoryFlowStore();
  const pieceId = await flowWithPiece(store, real, testPlan());
  for (const step of ['design', 'script'] as const) {
    store.run(step);
    store.complete(step, {});
    store.continue();
  }
  const render = vi.spyOn(animation, 'render');
  TestBed.configureTestingModule({
    providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } }, { provide: FlowStore, useValue: store }, { provide: ANIMATION, useValue: animation }, { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } }],
  });
  const fixture = TestBed.createComponent(RenderCard);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  return { fixture, el, get, click, store, render, pieceId };
}

describe('RenderCard', () => {
  it('shows the estimate as an estimate, with the frame rate and size, and draws nothing until Draw is pressed', async () => {
    const { get, store, render } = await create();
    expect(get('estimate')!.textContent).toContain('Estimate (it may be off)');
    expect(get('estimate')!.textContent).toContain('30 fps');
    expect(get('estimate')!.textContent).toContain('1280×720');
    expect(get('draw')).not.toBeNull();
    expect(render).not.toHaveBeenCalled();
    expect(store.flow()?.current).toBe('render');
    expect(store.flow()?.steps.render.status).toBe('pending');
  });

  it('has no switch: Render never goes on by itself', async () => {
    const { get } = await create();
    expect(get('auto')).toBeNull();
  });

  it('draws when Draw is pressed, follows the progress, and ends in review with the video', async () => {
    const { get, click, store, render, fixture, pieceId } = await create();
    await click('draw');
    expect(render).toHaveBeenCalledWith(pieceId);
    expect(store.flow()?.steps.render.status).toBe('running');
    expect(get('progress')).not.toBeNull();
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(store.flow()?.steps.render.status).toBe('waiting');
    });
    expect(get('video')!.getAttribute('src')).toContain('?ticket=T');
    expect(store.flow()?.steps.render.result?.['video']).toBeTruthy();
  });

  it('Finish goes on to Done', async () => {
    const { click, store, fixture } = await create();
    await click('draw');
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(store.flow()?.steps.render.status).toBe('waiting');
    });
    await click('continue');
    expect(store.flow()?.current).toBe('done');
  });

  it('shows the reason when the drawing is refused, and Retry asks again', async () => {
    let calls = 0;
    const { get, click, store } = await create({ port: (real) => Object.assign(Object.create(real), { render: () => (++calls, throwError(() => new AnimationFailure('refused', 'the script is out of range'))) }) });
    await click('draw');
    expect(store.flow()?.steps.render).toMatchObject({ status: 'failed', reason: 'the script is out of range' });
    expect(get('failed')!.textContent).toContain('the script is out of range');
    await click('draw');
    expect(calls).toBe(2);
  });

  it('says the server is busy while it is drawing something else', async () => {
    const { get, click } = await create({ port: (real) => Object.assign(Object.create(real), { render: () => throwError(() => new AnimationFailure('busy', 'drawing')) }) });
    await click('draw');
    expect(get('busy')!.textContent).toContain('drawing something else');
  });

  it('is reopened while the server draws: it follows the piece from where it is', async () => {
    const real = new InMemoryAnimation({ stepMs: 30, pollMs: 5 });
    const store = memoryFlowStore();
    const pieceId = await flowWithPiece(store, real, testPlan());
    const { firstValueFrom } = await import('rxjs');
    await firstValueFrom(real.render(pieceId));
    store.run('render');
    TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en' } }, { provide: FlowStore, useValue: store }, { provide: ANIMATION, useValue: real }, { provide: TicketService, useValue: { withTicket: (u: string) => u } }] });
    const fixture = TestBed.createComponent(RenderCard);
    await settle(fixture);
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(store.flow()?.steps.render.status).toBe('waiting');
    });
  });

  it('speaks Spanish when the host does', async () => {
    const { get } = await create({ lang: 'es' });
    expect(get('estimate')!.textContent).toContain('Estimación');
  });
});
