import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideLabForms } from '@lab/forms-kit';
import { firstValueFrom, throwError } from 'rxjs';

import { stubStorage } from '../../testing/memory-storage';
import { Notifier } from '../shared/notifier';
import { InMemoryVideoGeneration } from '../video/in-memory.adapter';
import { ApiError } from '@lab/api-client';
import { DEFAULT_SETTINGS } from '../video/model';
import { VIDEO_GENERATION } from '../video/tokens';
import { StudioPage } from './studio.page';
import { InMemoryVideoEdit } from '../video-edit/in-memory.adapter';
import { VIDEO_EDIT } from '../video-edit/tokens';

function setup(lang: 'es' | 'en' = 'en') {
  stubStorage({ 'video-studio.lang': lang });
  const adapter = new InMemoryVideoGeneration({ pace: 10, steps: 4, videoUrl: 'v.mp4' });
  const notifier = { request: vi.fn(async () => undefined), show: vi.fn() };
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang }), { provide: VIDEO_GENERATION, useValue: adapter }, { provide: VIDEO_EDIT, useValue: new InMemoryVideoEdit() }, { provide: Notifier, useValue: notifier }] });
  const fixture = TestBed.createComponent(StudioPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(selector: string, root: ParentNode = el) => root.querySelector(selector) as T;
  const all = (selector: string, root: ParentNode = el) => [...root.querySelectorAll(selector)] as HTMLElement[];
  const settle = async (ms = 0) => {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = async (value: string) => {
    const box = q<HTMLTextAreaElement>('textarea');
    box.value = value;
    box.dispatchEvent(new Event('input'));
    await settle();
  };
  /** Opens the picker of a settings row and chooses the option with that text. */
  const pickIn = async (id: string, label: string) => {
    q<HTMLElement>(`[data-testid=${id}]`).click();
    await settle();
    all('.settings-menu .mat-mdc-menu-item', document.body)
      .find((o) => o.textContent?.trim() === label)!
      .click();
    await settle();
  };
  const rowValue = (id: string) => q(`[data-testid=${id}] .value`).textContent?.trim();
  const generate = async (prompt: string) => {
    await type(prompt);
    q<HTMLButtonElement>('[data-testid=generate]').click();
    await settle();
  };
  const choose = async (name: string) => {
    await pickIn('row-model', name);
  };
  const dialogs = () => TestBed.inject(MatDialog).openDialogs.length;
  const button = (label: string, root: ParentNode = el) => all('button', root).find((b) => b.textContent?.trim() === label);
  const states = () => all('app-history li').map((li) => li.getAttribute('data-state'));
  return { fixture, adapter, notifier, el, q, all, settle, type, pickIn, rowValue, choose, generate, button, states, dialogs };
}

describe('StudioPage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('puts the creation panel and the history in two framed panels, side by side', () => {
    const { q, el } = setup();
    const panels = [...el.querySelectorAll('.studio > section.frame')];
    expect(panels).toHaveLength(2);
    expect(q('app-create-panel', panels[0])).toBeTruthy();
    expect(q('app-history', panels[1])).toBeTruthy();
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(styles).toMatch(/\.frame[^{]*\{[^}]*var\(--lab-radius-panel\)/);
    expect(styles).toMatch(/max-width:\s*900px/);
  });

  describe('the history', () => {
    it('says it is empty instead of showing an empty box', () => {
      const { el } = setup();
      expect(el.querySelector('app-history .empty')?.textContent).toContain('No generations yet');
      expect(el.querySelector('app-history ul')).toBeNull();
    });

    it('adds a generation at the top at once, queued, and then shows it running with progress', async () => {
      const { generate, settle, states, q } = setup();
      await generate('a fox');
      expect(states()).toEqual(['queued']);
      expect(q('app-history progress')).not.toBeNull();

      await settle(25);
      expect(states()).toEqual(['running']);
      expect(Number(q<HTMLProgressElement>('app-history progress').value)).toBeGreaterThan(0);
    });

    it('shows the prompt, the duration, the aspect ratio and the quality of each entry', async () => {
      const { generate, el } = setup();
      await generate('a fox in the snow');
      expect(el.querySelector('app-history li .prompt')?.textContent).toContain('a fox in the snow');
      expect([...el.querySelectorAll('app-history li .pill')].slice(1).map((p) => p.textContent?.trim())).toEqual(['5 s', '16:9', '720p']);
    });

    it('shows the name of the model each entry was made with', async () => {
      const { generate, choose, el } = setup();
      await choose('Fast');
      await generate('quick one');
      expect([...el.querySelectorAll('app-history li .pill')].map((p) => p.textContent?.trim())).toEqual(['Fast', '5 s', '16:9', '720p']);
    });

    it('runs several generations together, newest on top, and both progress', async () => {
      const { generate, settle, all, states } = setup();
      await generate('first');
      await settle(15);
      await generate('second');
      await settle(25);
      expect(all('app-history .prompt').map((p) => p.textContent?.trim())).toEqual(['second', 'first']);
      const bars = all('app-history progress').map((p) => Number((p as HTMLProgressElement).value));
      expect(bars).toHaveLength(2);
      expect(bars.every((v) => v > 0)).toBe(true);
      expect(states()).toEqual(['running', 'running']);
    });

    it('keeps the panel usable while a generation runs', async () => {
      const { generate, settle, q } = setup();
      await generate('first');
      await settle(15);
      expect(q<HTMLTextAreaElement>('textarea').disabled).toBe(false);
      await generate('second');
      expect(q<HTMLElement>('app-history')).not.toBeNull();
    });

    it('shows a failed entry with its message and leaves the others alone', async () => {
      const { generate, settle, adapter, states, all } = setup();
      adapter.failNext();
      await generate('doomed');
      await generate('fine');
      await settle(200);
      expect(states()).toEqual(['done', 'failed']);
      expect(all('app-history li')[1].querySelector('[role=alert]')?.textContent).toContain('Simulated failure');
      expect(all('app-history li')[0].querySelector('[role=alert]')).toBeNull();
    });

    it('lets the demo checkbox make the next generation fail', async () => {
      const { q, generate, settle, states, fixture } = setup();
      const box = q<HTMLInputElement>('.demo input');
      box.click();
      fixture.detectChanges();
      expect(box.checked).toBe(true);
      await generate('doomed');
      await settle(200);
      expect(states()).toEqual(['failed']);
      expect(box.checked).toBe(false);
    });

    it('lets the demo box be unticked to take the failure back', async () => {
      const { q, generate, settle, states, fixture } = setup();
      const box = q<HTMLInputElement>('.demo input');
      box.click();
      box.click();
      fixture.detectChanges();
      expect(box.checked).toBe(false);
      await generate('fine');
      await settle(200);
      expect(states()).toEqual(['done']);
    });
  });

  describe('a finished video', () => {
    async function finished(prompt = 'a fox') {
      const s = setup();
      await s.generate(prompt);
      await s.settle(200);
      return s;
    }

    it('opens in a player framed with its aspect ratio, with download, repeat and delete', async () => {
      const s = await finished();
      s.button('View')!.click();
      await s.settle();
      const dialog = document.querySelector('app-viewer-dialog') as HTMLElement;
      expect(dialog).not.toBeNull();
      expect((dialog.querySelector('.frame') as HTMLElement).style.aspectRatio).toBe('16 / 9');
      const video = dialog.querySelector('video') as HTMLVideoElement;
      // It opens paused on a frame (the fragment), not playing and not on a black box.
      expect(video.getAttribute('src')).toBe('v.mp4#t=0.1');
      expect(video.autoplay).toBe(false);
      expect(video.paused).toBe(true);
      const download = dialog.querySelector('a[download]') as HTMLAnchorElement;
      expect(download.getAttribute('href')).toBe('v.mp4');
      expect(s.button('Repeat', dialog)).toBeDefined();
      expect(s.button('Delete', dialog)).toBeDefined();
    });

    it('offers no player for a generation that is not done', async () => {
      const s = setup();
      await s.generate('a fox');
      expect(s.button('View')).toBeUndefined();
      expect(s.el.querySelector('app-history a[download]')).toBeNull();
    });

    it('loads the panel with the same prompt and settings on repeat, and generates nothing', async () => {
      const s = setup();
      await s.type('first');
      await s.pickIn('row-aspect', '9:16');
      await s.pickIn('row-quality', '1080p');
      s.q<HTMLButtonElement>('[data-testid=generate]').click();
      await s.settle(200);
      await s.type('something else');
      await s.pickIn('row-aspect', '1:1');

      s.button('Repeat')!.click();
      await s.settle();
      expect(s.q<HTMLTextAreaElement>('textarea').value).toBe('first');
      expect(s.rowValue('row-aspect')).toBe('9:16');
      expect(s.rowValue('row-quality')).toBe('1080p');
      expect(s.states()).toEqual(['done']);
    });

    it('loads the model of the generation into the panel on repeat', async () => {
      const s = setup();
      await s.choose('Cinematic');
      await s.generate('first');
      await s.settle(200);
      await s.choose('Fast');
      s.button('Repeat')!.click();
      await s.settle();
      expect(s.rowValue('row-model')).toContain('Cinematic');
      expect(s.states()).toEqual(['done']);
    });

    it('repeats from the viewer too, closing it', async () => {
      const s = await finished('first');
      s.button('View')!.click();
      await s.settle();
      s.button('Repeat', document.querySelector('app-viewer-dialog') as HTMLElement)!.click();
      await s.settle(500);
      expect(s.dialogs()).toBe(0);
      expect(s.q<HTMLTextAreaElement>('textarea').value).toBe('first');
      expect(s.states()).toEqual(['done']);
    });

    it('asks before deleting, keeps the entry on cancel and removes it on confirm', async () => {
      const s = await finished();
      s.button('Delete')!.click();
      await s.settle();
      const confirm = document.querySelector('app-confirm-dialog') as HTMLElement;
      expect(confirm).not.toBeNull();
      expect(s.states()).toEqual(['done']);

      s.button('Cancel', confirm)!.click();
      await s.settle(500);
      expect(s.dialogs()).toBe(0);
      expect(s.states()).toEqual(['done']);

      s.button('Delete')!.click();
      await s.settle();
      s.button('Delete', document.querySelector('app-confirm-dialog') as HTMLElement)!.click();
      await s.settle(500);
      expect(s.states()).toEqual([]);
      expect(s.el.querySelector('app-history .empty')).not.toBeNull();
    });

    it('asks before deleting from the viewer as well', async () => {
      const s = await finished();
      s.button('View')!.click();
      await s.settle();
      s.button('Delete', document.querySelector('app-viewer-dialog') as HTMLElement)!.click();
      await s.settle(500);
      expect(document.querySelector('app-confirm-dialog')).not.toBeNull();
      expect(s.states()).toEqual(['done']);
    });

    it('can delete a generation that is still running', async () => {
      const s = setup();
      await s.generate('a fox');
      await s.settle(15);
      s.button('Delete')!.click();
      await s.settle();
      s.button('Delete', document.querySelector('app-confirm-dialog') as HTMLElement)!.click();
      await s.settle(500);
      expect(s.states()).toEqual([]);
    });
  });

  it('shows the reason when the port refuses the request', async () => {
    const s = setup();
    const refuse = vi.spyOn(s.adapter, 'create').mockReturnValue(throwError(() => new Error('the duration must be from 4 to 30 seconds')));
    await s.generate('a fox');
    expect(refuse).toHaveBeenCalledOnce();
    expect(s.el.querySelector('.studio > .history > .error')?.textContent).toContain('The generation could not be created: the duration must be from 4 to 30 seconds');
    expect(s.states()).toEqual([]);
  });

  it('shows the part and what is accepted when the server refuses an input, keeping what was chosen', async () => {
    const s = setup();
    vi.spyOn(s.adapter, 'create').mockReturnValue(throwError(() => new ApiError(422, 'validation_failed', 'reference_audios: "a.txt" must be a .mp3, .wav, .m4a, .aac, .ogg or .flac file')));
    await s.generate('a fox');
    expect(s.el.querySelector('.studio > .history > .error')?.textContent).toContain('reference_audios: "a.txt" must be a .mp3');
    expect(s.q<HTMLTextAreaElement>('textarea').value).toBe('a fox');
  });

  describe('the notice when a generation finishes', () => {
    const snack = () => document.body.querySelector('.mdc-snackbar__label')?.textContent?.trim();
    const snackAction = () => document.body.querySelector<HTMLButtonElement>('.mdc-snackbar__actions button');
    const hidden = (value: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    afterEach(() => {
      delete (document as { hidden?: boolean }).hidden;
      TestBed.inject(MatSnackBar).dismiss();
    });

    it('says the video is ready, in the language of the page, and View opens it', async () => {
      const { generate, settle, dialogs } = setup('en');
      await generate('a fox');
      expect(snack()).toBeUndefined();
      await settle(100);
      expect(snack()).toBe('Video ready');
      expect(snackAction()?.textContent?.trim()).toBe('View');
      snackAction()!.click();
      await settle();
      expect(dialogs()).toBe(1);
    });

    it('is in Spanish when the page is', async () => {
      const { generate, settle } = setup('es');
      await generate('un zorro');
      await settle(100);
      expect(snack()).toBe('Vídeo listo');
      expect(snackAction()?.textContent?.trim()).toBe('Ver');
    });

    it('says a generation failed, with no View', async () => {
      const { generate, settle, adapter } = setup('en');
      adapter.failNext();
      await generate('doomed');
      await settle(100);
      expect(snack()).toBe('The generation failed');
      expect(snackAction()).toBeNull();
    });

    it('also sends a browser notification when the page is hidden, and none when it is in view', async () => {
      const visible = setup('en');
      await visible.generate('seen');
      await visible.settle(100);
      expect(visible.notifier.show).not.toHaveBeenCalled();
      TestBed.resetTestingModule();

      hidden(true);
      const away = setup('en');
      await away.generate('a fox in the snow');
      await away.settle(100);
      expect(away.notifier.show).toHaveBeenCalledWith('Video ready', 'a fox in the snow', expect.any(Function));
    });

    it('asks for the permission when Generate is pressed, not when the page loads', async () => {
      const { notifier, generate } = setup('en');
      expect(notifier.request).not.toHaveBeenCalled();
      await generate('a fox');
      expect(notifier.request).toHaveBeenCalledTimes(1);
    });
  });

  describe('the history across a reload', () => {
    it('shows the generations the previous page left in the storage, and the cut-short one as failed', async () => {
      stubStorage({ 'video-studio.lang': 'en' });
      const data = new Map<string, string>();
      const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
      const before = new InMemoryVideoGeneration({ pace: 10, steps: 4, videoUrl: 'v.mp4', storage: store });
      await firstValueFrom(before.create({ ...DEFAULT_SETTINGS, model: 'balanced', prompt: 'finished before' }));
      await vi.advanceTimersByTimeAsync(200);
      await firstValueFrom(before.create({ ...DEFAULT_SETTINGS, model: 'balanced', prompt: 'cut short' }));
      await vi.advanceTimersByTimeAsync(15);

      const after = new InMemoryVideoGeneration({ pace: 10, steps: 4, videoUrl: 'v.mp4', storage: store });
      TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' }), { provide: VIDEO_GENERATION, useValue: after }, { provide: VIDEO_EDIT, useValue: new InMemoryVideoEdit() }] });
      const fixture = TestBed.createComponent(StudioPage);
      fixture.detectChanges();
      // The previous page's timer is still on the fake clock, so `whenStable` would wait for it: only flush the clock.
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();

      const entries = [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-history li')];
      expect(entries.map((li) => li.getAttribute('data-state'))).toEqual(['failed', 'done']);
      expect(entries[0].textContent).toContain('cut short');
      expect(entries[1].textContent).toContain('finished before');
      expect(document.body.querySelector('.mdc-snackbar__label')).toBeNull();
    });

    it('shows a model that is no longer listed by its identifier', async () => {
      stubStorage({ 'video-studio.lang': 'en' });
      const old = { id: 'gen-1', state: 'done', progress: 100, videoUrl: 'v.mp4', settings: { ...DEFAULT_SETTINGS, prompt: 'old one', model: 'retired-model' } };
      const store = { getItem: () => JSON.stringify([old]), setItem: () => undefined };
      const adapter = new InMemoryVideoGeneration({ pace: 10, steps: 4, videoUrl: 'v.mp4', storage: store });
      TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' }), { provide: VIDEO_GENERATION, useValue: adapter }, { provide: VIDEO_EDIT, useValue: new InMemoryVideoEdit() }] });
      const fixture = TestBed.createComponent(StudioPage);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();
      expect([...(fixture.nativeElement as HTMLElement).querySelectorAll('app-history li .pill')].slice(0, 2).map((p) => p.textContent?.trim())).toEqual(['retired-model', '5 s']);
    });
  });
});
