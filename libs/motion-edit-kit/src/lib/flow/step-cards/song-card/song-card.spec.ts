import { TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, IN_MEMORY_ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { SONGS } from '@lab/music-studio-kit';
import { TicketService } from '@lab/server-connection';

import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { FlowStore } from '../../flow.store';
import { FakeSongs, memoryFlowStore, settle, testPlan } from '../../flow.testing';
import { SongCard } from './song-card';

async function create(options: { setup?: (songs: FakeSongs, store: FlowStore) => void; lang?: 'es' | 'en' } = {}) {
  const songs = new FakeSongs();
  const store = memoryFlowStore();
  const animation = new InMemoryAnimation();
  store.start('a neon track', testPlan());
  options.setup?.(songs, store);
  TestBed.configureTestingModule({
    providers: [
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } },
      provideLabForms({ lang: options.lang ?? 'en' }),
      { provide: FlowStore, useValue: store },
      { provide: SONGS, useValue: songs.port() },
      { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } },
      { provide: ANIMATION, useValue: animation },
      { provide: IN_MEMORY_ANIMATION, useValue: animation },
    ],
  });
  const fixture = TestBed.createComponent(SongCard);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = async (id: string) => {
    get(id)!.click();
    await settle(fixture);
  };
  return { fixture, el, get, click, songs, store, animation };
}

describe('SongCard', () => {
  it('checks the engines, makes the song from the plan, shows what was sent and follows it', async () => {
    const { get, songs, store, fixture } = await create();
    expect(songs.requests).toEqual([{ title: 'Night Drive', lyrics: '[verse]\nla la', style: 'synthwave', generator: 'ace-step', instrumental: false }]);
    expect(store.flow()?.steps.song.status).toBe('running');
    expect(get('sent')!.textContent).toContain('Night Drive');
    expect(get('progress')!.textContent).toContain('Queued');
    songs.set('song-1', { phase: 'running' });
    await settle(fixture);
    expect(get('progress')!.textContent).toContain('Making the song');
  });

  it('asks for the length the plan carries', async () => {
    const { songs } = await create({ setup: (_s, st) => st.setPlan({ ...st.flow()!.plan, song: { ...st.flow()!.plan.song, seconds: 45 } }) });
    expect(songs.requests[0]).toMatchObject({ seconds: 45 });
  });

  it('reviews a finished song: it plays, with its length, and keeps the id for resuming', async () => {
    const { get, songs, store, fixture } = await create();
    songs.finish('song-1', 95);
    await settle(fixture);
    expect(get('review')!.textContent).toContain('95 s');
    expect(get('player')!.getAttribute('src')).toBe('/audio/song-1.wav?ticket=T');
    expect(store.flow()?.refs.songId).toBe('song-1');
    expect(store.flow()?.steps.song.status).toBe('waiting');
  });

  it('says a generator cannot be used and offers to start it, to use another, or to check again, and does not make the song meanwhile', async () => {
    const { get, songs, click, store } = await create({
      setup: (s, st) => {
        s.engines$.next([{ generator: 'ace-step', available: true }, { generator: 'heartmula', available: false, reason: 'not_running', detail: 'stopped' }]);
        st.setPlan({ ...st.flow()!.plan, song: { ...st.flow()!.plan.song, generator: 'heartmula' } });
      },
    });
    expect(get('engine-down')!.textContent).toContain('HeartMuLa'.toLowerCase());
    expect(songs.requests).toEqual([]);
    expect(store.flow()?.steps.song.status).toBe('pending');
    await click('start-engine');
    expect(songs.started).toEqual(['heartmula']);
    await click('use-other');
    expect(store.flow()?.plan.song.generator).toBe('ace-step');
    expect(songs.requests).toHaveLength(1);
  });

  it('regenerates with the same texts and lists the earlier song as an earlier attempt', async () => {
    const { get, songs, click, store, fixture } = await create();
    songs.finish('song-1');
    await settle(fixture);
    await click('regenerate');
    expect(songs.requests).toHaveLength(2);
    expect(songs.requests[1]).toEqual(songs.requests[0]);
    expect(store.flow()?.attempts).toEqual([expect.objectContaining({ kind: 'song', id: 'song-1' })]);
    expect(get('progress')).not.toBeNull();
  });

  it('edits the texts and regenerates with them', async () => {
    const { el, get, songs, click, store, fixture } = await create();
    songs.finish('song-1');
    await settle(fixture);
    await click('edit-texts');
    const lyrics = el.querySelector<HTMLTextAreaElement>('dynamic-form textarea')!;
    lyrics.value = '[chorus]\nnew words';
    lyrics.dispatchEvent(new Event('input'));
    await settle(fixture);
    await click('apply');
    expect(songs.requests[1].lyrics).toBe('[chorus]\nnew words');
    expect(store.flow()?.plan.song.lyrics).toBe('[chorus]\nnew words');
  });

  it('picks a song the library already has, which replaces the one made', async () => {
    const { get, songs, click, store, fixture, animation } = await create();
    songs.finish('song-1');
    await settle(fixture);
    await click('pick-existing');
    const first = (await import('rxjs').then((r) => r.firstValueFrom(animation.songs())))[0];
    await click(`pick-${first.key}`);
    expect(store.flow()?.refs).toMatchObject({ songId: first.project, libraryKey: first.key });
    expect(store.flow()?.steps.song.result).toMatchObject({ picked: true, title: first.title });
    expect(store.flow()?.attempts.map((a) => a.id)).toEqual(['song-1']);
    expect(get('pick-list')).toBeNull();
  });

  it('Continue waits for the library: in memory mode it adds the song, then goes on to the song map', async () => {
    const { songs, click, store, fixture, animation } = await create();
    songs.finish('song-1');
    await settle(fixture);
    await click('continue');
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(store.flow()?.current).toBe('map');
    });
    const library = await import('rxjs').then((r) => r.firstValueFrom(animation.songs()));
    expect(library.some((s) => s.project === 'song-1')).toBe(true);
    expect(store.flow()?.refs.libraryKey).toBe('song-1/track-1/0');
  });

  it('shows the reason when the song fails and offers Retry and Edit texts', async () => {
    const { get, songs, click, fixture } = await create();
    songs.set('song-1', { phase: 'failed', reason: 'out of memory' });
    await settle(fixture);
    expect(get('failed')!.textContent).toContain('out of memory');
    await click('retry');
    expect(songs.requests).toHaveLength(2);
    expect(get('edit-texts')).toBeNull();
  });

  it('speaks Spanish when the host does', async () => {
    const { get } = await create({ lang: 'es' });
    expect(get('progress')!.textContent).toContain('En cola');
  });
});
