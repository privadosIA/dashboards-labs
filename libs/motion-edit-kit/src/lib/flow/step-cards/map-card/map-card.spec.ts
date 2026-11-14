import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';

import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { FlowStore } from '../../flow.store';
import { memoryFlowStore, settle, testPlan } from '../../flow.testing';
import { MapCard } from './map-card';

async function create(options: { libraryKey?: string | null; auto?: boolean; lang?: 'es' | 'en' } = {}) {
  const store = memoryFlowStore();
  const animation = new InMemoryAnimation({ transcribeMs: 5 });
  const first = (await firstValueFrom(animation.songs()))[0];
  store.start('a neon track', testPlan());
  if (options.libraryKey !== null) store.setRefs({ songId: first.project, libraryKey: options.libraryKey ?? first.key });
  if (options.auto) store.setAuto('map', true);
  store.run('song');
  store.complete('song');
  store.continue();
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } }, { provide: FlowStore, useValue: store }, { provide: ANIMATION, useValue: animation }] });
  const fixture = TestBed.createComponent(MapCard);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  return { fixture, el, get, click, store, animation, first };
}

describe('MapCard', () => {
  it('makes the piece from the library song with the plan choices and the prompt, and shows what was sent and the map', async () => {
    const { get, store, animation } = await create();
    await vi.waitFor(() => expect(store.flow()?.steps.map.status).toBe('waiting'));
    expect(get('sent')!.textContent).toContain('typographic');
    expect(get('sent')!.textContent).toContain('1280x720');
    const pieceId = store.flow()?.refs.pieceId;
    expect(pieceId).toBeTruthy();
    expect((await firstValueFrom(animation.pieces())).map((p) => p.id)).toContain(pieceId);
    expect((await firstValueFrom(animation.piece(pieceId!))).title).toBe(store.flow()?.steps.map.result?.['title']);
  });

  it('reviews the map: duration, tempo, sections and the words count', async () => {
    const { get, fixture, store } = await create();
    await vi.waitFor(() => expect(store.flow()?.steps.map.status).toBe('waiting'));
    await settle(fixture);
    expect(get('summary')!.textContent).toMatch(/\d+ s · \d+ bpm · \d+ sections · \d+ words/);
  });

  it('offers Transcribe while the words are estimated and says so no more once they are heard', async () => {
    const { get, click, fixture, store } = await create();
    await vi.waitFor(() => expect(store.flow()?.steps.map.status).toBe('waiting'));
    await settle(fixture);
    expect(get('words-note')!.textContent).toContain('estimate');
    await click('transcribe');
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(get('words-note')!.textContent).toContain('heard');
    });
    expect(get('transcribe')).toBeNull();
    expect(store.flow()?.steps.map.result?.['wordsEstimated']).toBe(false);
  });

  it('Continue goes on to the design', async () => {
    const { click, fixture, store } = await create();
    await vi.waitFor(() => expect(store.flow()?.steps.map.status).toBe('waiting'));
    await settle(fixture);
    await click('continue');
    expect(store.flow()?.current).toBe('design');
    expect(store.flow()?.steps.map.status).toBe('done');
  });

  it('does not stop when its switch is set, and the switch is on the card', async () => {
    const { get, store } = await create({ auto: true });
    await vi.waitFor(() => expect(store.flow()?.current).toBe('design'));
    expect(store.flow()?.steps.map.status).toBe('done');
    expect(get('auto')).toBeNull();
  });

  it('sets the switch from the review', async () => {
    const { get, fixture, store } = await create();
    await vi.waitFor(() => expect(store.flow()?.steps.map.status).toBe('waiting'));
    await settle(fixture);
    (get('auto') as HTMLInputElement).click();
    expect(store.flow()?.autoContinue.map).toBe(true);
  });

  it('fails with the reason when the song is not in the library, and Retry tries again', async () => {
    const { get, store, click } = await create({ libraryKey: 'nope/track-1/0' });
    await vi.waitFor(() => expect(store.flow()?.steps.map.status).toBe('failed'));
    expect(store.flow()?.steps.map.reason).toContain('nope/track-1/0');
    await click('retry');
    expect(get('failed')).not.toBeNull();
  });

  it('fails when the flow has no song of the library', async () => {
    const { store } = await create({ libraryKey: null });
    expect(store.flow()?.steps.map).toMatchObject({ status: 'failed' });
  });

  it('speaks Spanish when the host does', async () => {
    const { get } = await create({ lang: 'es' });
    expect(get('sent')!.textContent).toContain('Enviado al servidor');
  });
});
