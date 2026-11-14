import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { TicketService } from '@lab/server-connection';

import { MOTION_EDIT_BASE, MOTION_EDIT_OPTIONS } from '../../../core/options';
import { FlowStore } from '../../flow.store';
import { flowWithPiece, memoryFlowStore, settle, testPlan } from '../../flow.testing';
import { DoneCard } from './done-card';

async function create(options: { attempts?: boolean; lang?: 'es' | 'en' } = {}) {
  const animation = new InMemoryAnimation();
  const store = memoryFlowStore();
  const pieceId = await flowWithPiece(store, animation, testPlan());
  store.run('render');
  store.complete('render', { video: '/media/out.mp4' });
  store.continue();
  if (options.attempts) {
    store.setRefs({ songId: 'old-song' });
    store.retireSong();
    store.setRefs({ pieceId: 'old-piece' });
    store.back('map');
    store.run('map');
    store.complete('map', {});
    store.setRefs({ pieceId });
  }
  TestBed.configureTestingModule({
    providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } }, { provide: MOTION_EDIT_BASE, useValue: '/motion-edit' }, provideRouter([]), { provide: FlowStore, useValue: store }, { provide: ANIMATION, useValue: animation }, { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(DoneCard);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  return { fixture, el, get, click, store, navigate, pieceId };
}

describe('DoneCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the video with the server ticket, and links to the piece', async () => {
    const { get, pieceId } = await create();
    expect(get('video')!.getAttribute('src')).toBe('/media/out.mp4?ticket=T');
    expect(get('open-piece')!.getAttribute('href')).toBe(`/motion-edit/pieces/${pieceId}`);
  });

  it('exports the dataset as a file', async () => {
    const created: Blob[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.assign(URL, { createObjectURL: (b: Blob) => (created.push(b), 'blob:x'), revokeObjectURL: () => undefined });
    const { get, click, fixture } = await create();
    await click('export');
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(get('saved')).not.toBeNull();
    });
    expect(get('saved')!.textContent).toContain('.motion.json');
    expect(created).toHaveLength(1);
  });

  it('starts a new flow from this one: same plan and prompt, nothing run, and opens it', async () => {
    const { click, store, navigate } = await create();
    const first = store.flow()!;
    await click('new-flow');
    const fresh = store.flow()!;
    expect(fresh.id).not.toBe(first.id);
    expect(fresh.plan).toEqual(first.plan);
    expect(fresh.steps.song.status).toBe('pending');
    expect(navigate).toHaveBeenCalledWith(['/motion-edit/flow', fresh.id]);
  });

  it('lists the earlier attempts, with Open for the pieces', async () => {
    const { get, el } = await create({ attempts: true });
    expect(get('attempts')!.textContent).toContain('old-song');
    expect(get('attempts')!.textContent).toContain('old-piece');
    expect(el.querySelector('[data-testid="open-attempt"]')!.getAttribute('href')).toBe('/motion-edit/pieces/old-piece');
  });

  it('lists no attempts when there are none', async () => {
    const { get } = await create();
    expect(get('attempts')).toBeNull();
  });

  it('speaks Spanish when the host does', async () => {
    const { get } = await create({ lang: 'es' });
    expect(get('export')!.textContent).toContain('Exportar');
  });
});
