import { firstValueFrom, type Observable } from 'rxjs';

import { InMemorySongs, SongNotFound } from './in-memory.adapter';
import type { Song, SongRequest } from './model';
import { DEFAULT_LISTEN } from './listen';
import { AssistFailed, EngineFailed, ListenFailed, SongRefused } from './port';

const request = (patch: Partial<SongRequest> = {}): SongRequest => ({ title: 'Night drive', lyrics: '[verse]\nla', style: 'lo-fi, chill', generator: 'heartmula', instrumental: false, ...patch });
const adapter = (options = {}) => new InMemorySongs({ pace: 10, audioUrl: 'a.wav', ...options });

function collect<T>(source: Observable<T>) {
  const seen: T[] = [];
  const done = { complete: false, error: undefined as unknown };
  source.subscribe({ next: (v) => seen.push(v), complete: () => (done.complete = true), error: (e) => (done.error = e) });
  return { seen, done };
}

const make = (a: InMemorySongs, r = request()) => firstValueFrom(a.generate(r));

describe('InMemorySongs', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('what the server would offer', () => {
    it('lists the three generators, all available by default, and the vocabulary', async () => {
      const a = adapter();
      expect((await firstValueFrom(a.engines())).map((e) => [e.generator, e.available])).toEqual([['heartmula', true], ['ace-step', true], ['diffrhythm2', true]]);
      expect((await firstValueFrom(a.vocabulary())).categories.map((c) => c.id)).toContain('vocal');
    });

    it('lists the engines with a container: running by default, stopped when the options say so, and LAION-CLAP stopped when it is off', async () => {
      const a = adapter({ clap: false, engines: [{ generator: 'diffrhythm2', available: false, reason: 'not_running' }] });
      expect(await firstValueFrom(a.containers())).toEqual([
        { engine: 'heartmula', available: true, container: 'running' },
        { engine: 'diffrhythm2', available: false, reason: 'not_running', container: 'stopped' },
        { engine: 'clap', available: false, reason: 'not_running', container: 'stopped' },
      ]);
    });

    it('starts LAION-CLAP, which then recognises, and stops it again', async () => {
      const a = adapter({ clap: false });
      await firstValueFrom(a.start('clap'));
      expect((await firstValueFrom(a.containers())).find((e) => e.engine === 'clap')).toEqual({ engine: 'clap', available: true, container: 'running' });
      expect((await firstValueFrom(a.recognizers())).find((r) => r.id === 'clap')).toEqual({ id: 'clap', available: true });
      await firstValueFrom(a.stopEngine('clap'));
      expect((await firstValueFrom(a.containers())).find((e) => e.engine === 'clap')).toMatchObject({ available: false, reason: 'not_running', container: 'stopped' });
      expect((await firstValueFrom(a.recognizers())).find((r) => r.id === 'clap')).toMatchObject({ available: false, reason: 'not_running' });
    });

    it('stops a generator, which then cannot be used until it is started', async () => {
      const a = adapter();
      await firstValueFrom(a.stopEngine('heartmula'));
      expect((await firstValueFrom(a.engines())).find((e) => e.generator === 'heartmula')).toMatchObject({ available: false, reason: 'not_running' });
      await firstValueFrom(a.start('heartmula'));
      expect((await firstValueFrom(a.engines())).find((e) => e.generator === 'heartmula')).toEqual({ generator: 'heartmula', available: true });
    });

    it('refuses to stop a generator while a song is being made with it', async () => {
      const a = adapter();
      await make(a);
      await expect(firstValueFrom(a.stopEngine('heartmula'))).rejects.toBeInstanceOf(EngineFailed);
    });

    it('brings up a stopped generator when it is started, and cannot start one that is broken for another reason', async () => {
      const a = adapter({ engines: [{ generator: 'heartmula', available: false, reason: 'not_running' }, { generator: 'diffrhythm2', available: false, reason: 'no_gpu' }] });
      await firstValueFrom(a.start('heartmula'));
      await firstValueFrom(a.start('diffrhythm2'));
      const list = await firstValueFrom(a.engines());
      expect(list.find((e) => e.generator === 'heartmula')).toEqual({ generator: 'heartmula', available: true });
      expect(list.find((e) => e.generator === 'diffrhythm2')?.available).toBe(false);
    });

    it('can be told that a generator is not available, with its reason', async () => {
      const a = adapter({ engines: [{ generator: 'heartmula', available: false, reason: 'no_gpu' }] });
      const heart = (await firstValueFrom(a.engines())).find((e) => e.generator === 'heartmula');
      expect(heart).toMatchObject({ available: false, reason: 'no_gpu' });
    });
  });

  describe('the assistant', () => {
    it('writes a title, lyrics with section tags and tags of the vocabulary from a prompt', async () => {
      const w = await firstValueFrom(adapter().write({ text: 'A soothing piano melody with gentle rain', generator: 'heartmula', instrumental: false }));
      expect(w.title).not.toBe('');
      expect(w.lyrics).toMatch(/\[verse\]/);
      expect(w.style.split(', ')).toContain('piano');
    });

    it('ignores the provider and the model: it has no assistant behind', async () => {
      const w = await firstValueFrom(adapter().write({ text: 'A soothing piano melody', generator: 'heartmula', instrumental: false, provider: 'router', model: 'x' }));
      expect(w.lyrics).not.toBe('');
    });

    it('writes no lyrics for an instrumental song', async () => {
      const w = await firstValueFrom(adapter().write({ text: 'a rock anthem', generator: 'heartmula', instrumental: true }));
      expect(w.lyrics).toBe('');
    });

    it('writes a sentence, not tags, for ACE-Step', async () => {
      const w = await firstValueFrom(adapter().write({ text: 'a slow lo-fi piece', generator: 'ace-step', instrumental: false }));
      expect(w.style).toBe('a slow lo-fi piece');
    });

    it('can be unavailable or refuse', async () => {
      await expect(firstValueFrom(adapter({ assistant: 'unavailable' }).write({ text: 'x', generator: 'heartmula', instrumental: false }))).rejects.toMatchObject({ kind: 'unavailable' });
      await expect(firstValueFrom(adapter({ assistant: 'refuses' }).write({ text: 'x', generator: 'heartmula', instrumental: false }))).rejects.toBeInstanceOf(AssistFailed);
    });
  });

  describe('listening to a file', () => {
    const file = new File(['x'], 'my song.mp3', { type: 'audio/mpeg' });

    it('describes how it sounds, with the tempo and the key', async () => {
      const heard = await firstValueFrom(adapter().listen(file, DEFAULT_LISTEN));
      expect(heard.style).toMatch(/lo-fi/);
      expect(heard).toMatchObject({ bpm: 92, keyscale: 'D minor', genreUnknown: false });
    });

    it('listens to a YouTube address and gives tags, and refuses another address', async () => {
      const heard = await firstValueFrom(adapter().listenUrl('https://youtu.be/abc', 'heartmula', DEFAULT_LISTEN));
      expect(heard.tags).toEqual(['lo-fi', 'chill']);
      await expect(firstValueFrom(adapter().listenUrl('https://vimeo.com/1', 'heartmula', DEFAULT_LISTEN))).rejects.toMatchObject({ kind: 'badUrl' });
    });

    it('lists the ways to recognise a song, with LAION-CLAP off when it is not running and MuQ off when its weights are missing', async () => {
      const on = await firstValueFrom(adapter().recognizers());
      expect(on.map((r) => [r.id, r.available])).toEqual([['whisper', true], ['clap', true], ['muq', true]]);
      const off = await firstValueFrom(adapter({ clap: false }).recognizers());
      expect(off.find((r) => r.id === 'clap')).toMatchObject({ available: false, reason: 'not_running' });
      expect((await firstValueFrom(adapter({ muq: false }).recognizers())).find((r) => r.id === 'muq')).toMatchObject({ available: false, reason: 'no_weights' });
    });

    it('is told what the user chose', async () => {
      const a = adapter();
      await firstValueFrom(a.listen(file, { method: 'clap', language: 'es', hint: 'piano, calm' }));
      expect(a.lastListen).toEqual({ source: 'my song.mp3', options: { method: 'clap', language: 'es', hint: 'piano, calm' } });
    });

    it('can fail for the reasons the server gives', async () => {
      for (const kind of ['unavailable', 'busy', 'tooLong', 'unreadable', 'timeout'] as const) {
        const failure = firstValueFrom(adapter({ listening: kind }).listen(file, DEFAULT_LISTEN));
        await expect(failure).rejects.toBeInstanceOf(ListenFailed);
        await expect(failure).rejects.toMatchObject({ kind });
      }
    });
  });

  describe('a song is made', () => {
    it('goes queued, running, then done with the length and an address', async () => {
      const a = adapter();
      const created = await make(a);
      expect(created.state).toEqual({ phase: 'queued', position: 1 });
      const run = collect(a.follow(created.id));
      await vi.advanceTimersByTimeAsync(100);
      expect(run.seen.map((s) => s.state.phase)).toEqual(['queued', 'running', 'done']);
      expect(run.seen.at(-1)?.state).toEqual({ phase: 'done', url: 'a.wav', seconds: 120 });
      expect(run.done.complete).toBe(true);
    });

    it('ignores the length of the request: it has no audio to measure', async () => {
      const a = adapter();
      const created = await make(a, request({ seconds: 45 }));
      const run = collect(a.follow(created.id));
      await vi.advanceTimersByTimeAsync(100);
      expect(run.seen.at(-1)?.state).toEqual({ phase: 'done', url: 'a.wav', seconds: 120 });
    });

    it('keeps the title, style and generator, and lists the newest first', async () => {
      const a = adapter();
      const first = await make(a, request({ title: 'One' }));
      await vi.advanceTimersByTimeAsync(5);
      const second = await make(a, request({ title: 'Two', generator: 'ace-step', style: 'a sentence' }));
      const list = await firstValueFrom(a.songs());
      expect(list.map((s) => s.id)).toEqual([second.id, first.id]);
      expect(list[0]).toMatchObject({ title: 'Two', style: 'a sentence', generator: 'ace-step' });
    });

    it('can fail with a reason', async () => {
      const a = adapter({ fail: 'the GPU ran out of memory' });
      const created = await make(a);
      const run = collect(a.follow(created.id));
      await vi.advanceTimersByTimeAsync(100);
      expect(run.seen.at(-1)?.state).toEqual({ phase: 'failed', reason: 'the GPU ran out of memory' });
    });

    it('delivers the final state at once when following a finished song', async () => {
      const a = adapter();
      const created = await make(a);
      await vi.advanceTimersByTimeAsync(100);
      const run = collect(a.follow(created.id));
      expect(run.seen).toHaveLength(1);
      expect(run.seen[0].state.phase).toBe('done');
      expect(run.done.complete).toBe(true);
    });

    it('refuses a request that is not valid or a generator that cannot be used, and creates nothing', async () => {
      await expect(make(adapter(), request({ title: '' }))).rejects.toMatchObject({ problems: ['title.required'] });
      const a = adapter({ engines: [{ generator: 'heartmula', available: false, reason: 'no_gpu' }] });
      await expect(make(a)).rejects.toMatchObject({ problems: ['generator.unavailable'] });
      await expect(make(a)).rejects.toBeInstanceOf(SongRefused);
      expect(await firstValueFrom(a.songs())).toEqual([]);
    });
  });

  describe('cancelling and removing', () => {
    it('a cancelled song ends as cancelled and never finishes', async () => {
      const a = adapter();
      const created = await make(a);
      await firstValueFrom(a.cancel(created.id));
      await vi.advanceTimersByTimeAsync(200);
      expect((await firstValueFrom(a.songs()))[0].state).toEqual({ phase: 'cancelled' });
    });

    it('removing a song takes it out of the list and ends its follower', async () => {
      const a = adapter();
      const created = await make(a);
      const run = collect(a.follow(created.id));
      await firstValueFrom(a.remove(created.id));
      expect(await firstValueFrom(a.songs())).toEqual([]);
      expect(run.done.complete).toBe(true);
    });

    it('asking for a song that is not there errors', async () => {
      await expect(firstValueFrom(adapter().cancel('nope'))).rejects.toBeInstanceOf(SongNotFound);
    });
  });

  describe('the history survives a reload when given a storage', () => {
    const memory = () => {
      const data = new Map<string, string>();
      return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    };

    it('brings back the finished songs and marks the unfinished ones as interrupted', async () => {
      const storage = memory();
      const a = adapter({ storage });
      const done = await make(a, request({ title: 'Finished' }));
      await vi.advanceTimersByTimeAsync(100);
      await make(a, request({ title: 'Unfinished' }));
      const b = adapter({ storage });
      const list: readonly Song[] = await firstValueFrom(b.songs());
      expect(list.map((s) => [s.title, s.state.phase])).toEqual([['Unfinished', 'failed'], ['Finished', 'done']]);
      expect(list.find((s) => s.id === done.id)?.state).toMatchObject({ phase: 'done' });
    });

    it('is not broken by a storage that holds something unreadable', async () => {
      const storage = { getItem: () => '{not json', setItem: () => undefined };
      expect(await firstValueFrom(adapter({ storage }).songs())).toEqual([]);
    });
  });
});
