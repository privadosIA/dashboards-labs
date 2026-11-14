import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';

import { stubStorage } from '../../testing/memory-storage';
import { SongDraftStore } from '../song/draft.store';
import { InMemorySongs, type InMemoryOptions } from '../song/in-memory.adapter';
import type { EngineStatus, SongRequest } from '../song/model';
import type { SongPort } from '../song/port';
import { SONGS } from '../song/tokens';
import { Composer } from './composer';

async function draw(options: InMemoryOptions = {}, port?: (real: InMemorySongs) => SongPort, saved: Record<string, string> = { 'music-studio.mode': 'custom' }) {
  stubStorage(saved);
  TestBed.resetTestingModule();
  const real = new InMemorySongs({ pace: 10, ...options });
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' }), { provide: SONGS, useValue: port ? port(real) : real }] });
  const fixture = TestBed.createComponent(Composer);
  await settle(fixture);
  return { fixture, store: TestBed.inject(SongDraftStore), real };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

const q = <T extends HTMLElement>(fixture: ComponentFixture<unknown>, sel: string) => (fixture.nativeElement as HTMLElement).querySelector<T>(sel);
const click = async (fixture: ComponentFixture<unknown>, sel: string) => {
  q<HTMLButtonElement>(fixture, sel)!.click();
  await settle(fixture);
};

describe('Composer', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('the mode', () => {
    it('is Easy the first time, without the Custom form', async () => {
      const { fixture } = await draw({}, undefined, {});
      expect(q(fixture, '[data-testid=mode-easy]')!.getAttribute('aria-pressed')).toBe('true');
      expect(q(fixture, 'app-custom-form')).toBeNull();
    });

    it('opens Custom, with its form, when that was the last choice', async () => {
      const { fixture } = await draw();
      expect(q(fixture, '[data-testid=mode-custom]')!.getAttribute('aria-pressed')).toBe('true');
      expect(q(fixture, 'app-custom-form')).toBeTruthy();
    });

    it('switches to Easy, remembers it, and keeps the text of Custom for the way back', async () => {
      const { fixture, store } = await draw();
      store.setTitle('Night drive');
      await click(fixture, '[data-testid=mode-easy]');
      expect(q(fixture, '[data-testid=mode-easy]')!.getAttribute('aria-pressed')).toBe('true');
      expect(q(fixture, 'app-custom-form')).toBeNull();
      expect(localStorage.getItem('music-studio.mode')).toBe('easy');
      await click(fixture, '[data-testid=mode-custom]');
      expect(q<HTMLTextAreaElement>(fixture, '[data-testid=title]')!.value).toBe('Night drive');
    });
  });

  describe('Generate', () => {
    it('is disabled and says what is missing until the title and the lyrics are written', async () => {
      const { fixture, store } = await draw();
      const button = q<HTMLButtonElement>(fixture, '[data-testid=generate]')!;
      expect(button.disabled).toBe(true);
      expect(q(fixture, '[data-testid=todo]')!.textContent).toContain('write a title, write the lyrics');
      store.setTitle('Night drive');
      await settle(fixture);
      expect(q(fixture, '[data-testid=todo]')!.textContent).toContain('write the lyrics');
      expect(q(fixture, '[data-testid=todo]')!.textContent).not.toContain('title');
      store.setLyrics('la la');
      store.setStyle('lo-fi');
      await settle(fixture);
      expect(button.disabled).toBe(false);
      expect(q(fixture, '[data-testid=todo]')).toBeNull();
    });

    it('waits for the server to say which generators it can use before it lets a song be made', async () => {
      const never = new Subject<readonly EngineStatus[]>();
      const { fixture, store } = await draw({}, (real) => ({ engines: () => never, vocabulary: () => real.vocabulary(), generate: (r: SongRequest) => real.generate(r) }) as unknown as SongPort);
      store.setTitle('Night drive');
      store.setLyrics('la la');
      store.setStyle('lo-fi');
      await settle(fixture);
      expect(q<HTMLButtonElement>(fixture, '[data-testid=generate]')!.disabled).toBe(true);
      never.next([{ generator: 'heartmula', available: true }]);
      await settle(fixture);
      expect(q<HTMLButtonElement>(fixture, '[data-testid=generate]')!.disabled).toBe(false);
    });

    it('asks the port for the song and goes back to ready', async () => {
      const { fixture, store, real } = await draw();
      store.setTitle('Night drive');
      store.setLyrics('la la');
      store.setStyle('lo-fi');
      await settle(fixture);
      await click(fixture, '[data-testid=generate]');
      const songs = await firstValueFrom(real.songs());
      expect(songs).toHaveLength(1);
      expect(songs[0]).toMatchObject({ title: 'Night drive', style: 'lo-fi', generator: 'heartmula' });
      expect(q<HTMLButtonElement>(fixture, '[data-testid=generate]')!.disabled).toBe(false);
    });

    it('says so when the server does not take the request', async () => {
      const { fixture, store } = await draw({}, (real) => ({ engines: () => real.engines(), vocabulary: () => real.vocabulary(), generate: () => throwError(() => new Error('down')) }) as unknown as SongPort);
      store.setTitle('Night drive');
      store.setLyrics('la la');
      store.setStyle('lo-fi');
      await settle(fixture);
      await click(fixture, '[data-testid=generate]');
      expect(q(fixture, '[data-testid=generate-error]')!.textContent).toContain('could not be asked');
    });
  });

  describe('a stopped generator', () => {
    const stopped: EngineStatus[] = [{ generator: 'heartmula', available: false, reason: 'not_running' }];

    it('says it is stopped and offers to start it, and can be used once it is up', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      try {
        const { fixture, store } = await draw({ engines: stopped });
        store.setTitle('Night drive');
        store.setLyrics('la la');
      store.setStyle('lo-fi');
        await settle(fixture);
        expect(q(fixture, '[data-testid=engine-reason]')!.textContent).toContain('stopped');
        expect(q<HTMLButtonElement>(fixture, '[data-testid=generate]')!.disabled).toBe(true);
        await click(fixture, '[data-testid=engine-start]');
        await vi.advanceTimersByTimeAsync(3000);
        await settle(fixture);
        expect(q(fixture, '[data-testid=engine-start]')).toBeNull();
        expect(q<HTMLButtonElement>(fixture, '[data-testid=generate]')!.disabled).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('offers no start for a generator that is broken for another reason', async () => {
      const { fixture } = await draw({ engines: [{ generator: 'heartmula', available: false, reason: 'no_gpu' }] });
      expect(q(fixture, '[data-testid=engine-start]')).toBeNull();
    });
  });

  describe('the generator', () => {
    it('is HeartMuLa when the server can use it', async () => {
      const { store } = await draw();
      expect(store.generator()).toBe('heartmula');
    });

    it('is the first one the server can use when HeartMuLa cannot, until the user picks one', async () => {
      const { store } = await draw({ engines: [{ generator: 'heartmula', available: false, reason: 'no_gpu' }] });
      expect(store.generator()).toBe('ace-step');
    });

    it('with none available keeps HeartMuLa, says why in words, and cannot generate', async () => {
      const off: EngineStatus[] = [
        { generator: 'heartmula', available: false, reason: 'no_gpu' },
        { generator: 'ace-step', available: false, reason: 'no_gpu' },
        { generator: 'diffrhythm2', available: false, reason: 'no_gpu' },
      ];
      const { fixture, store } = await draw({ engines: off });
      store.setTitle('Night drive');
      store.setLyrics('la la');
      store.setStyle('lo-fi');
      await settle(fixture);
      expect(store.generator()).toBe('heartmula');
      expect(q(fixture, '[data-testid=engine-reason]')!.textContent).toContain('No card has free memory');
      expect(q<HTMLButtonElement>(fixture, '[data-testid=generate]')!.disabled).toBe(true);
      expect(q(fixture, '[data-testid=todo]')!.textContent).toContain('choose a generator that is available');
    });
  });

  describe('Easy', () => {
    it('is disabled until the music is described, and says so', async () => {
      const { fixture, store } = await draw();
      store.setMode('easy');
      await settle(fixture);
      expect(q<HTMLButtonElement>(fixture, '[data-testid=generate]')!.disabled).toBe(true);
      expect(q(fixture, '[data-testid=todo]')!.textContent).toContain('describe the music');
    });

    it('has the assistant write the song from the prompt and then generates it', async () => {
      const { fixture, store, real } = await draw();
      store.setMode('easy');
      store.setPrompt('A soothing piano melody with gentle rain');
      await settle(fixture);
      await click(fixture, '[data-testid=generate]');
      const songs = await firstValueFrom(real.songs());
      expect(songs).toHaveLength(1);
      expect(songs[0]).toMatchObject({ title: 'A soothing piano melody', generator: 'heartmula' });
      expect(songs[0].style).toContain('piano');
    });

    it('opens Custom to add the style tags when the assistant wrote none for a generator that needs them', async () => {
      const { fixture, store, real } = await draw({}, (port) => ({ engines: () => port.engines(), vocabulary: () => port.vocabulary(), songs: () => port.songs(), generate: (r: SongRequest) => port.generate(r), write: () => of({ title: '', lyrics: '[verse]\nla', style: '' }) }) as unknown as SongPort);
      store.setMode('easy');
      store.setPrompt('A soothing piano melody');
      await settle(fixture);
      await click(fixture, '[data-testid=generate]');
      expect(await firstValueFrom(real.songs())).toEqual([]);
      expect(store.mode()).toBe('custom');
      expect(store.lyrics()).toBe('[verse]\nla');
      expect(q(fixture, '[data-testid=todo]')!.textContent).toContain('pick at least one style tag');
    });

    it('generates nothing and says why when the assistant is not there', async () => {
      const { fixture, store, real } = await draw({ assistant: 'unavailable' });
      store.setMode('easy');
      store.setPrompt('A soothing piano melody');
      await settle(fixture);
      await click(fixture, '[data-testid=generate]');
      expect(await firstValueFrom(real.songs())).toEqual([]);
      expect(q(fixture, '[data-testid=write-error]')!.textContent).toContain('not available');
      expect(q<HTMLButtonElement>(fixture, '[data-testid=generate]')!.disabled).toBe(false);
    });
  });
});
