import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../../../../testing/memory-storage';
import { SongDraftStore } from '../../../song/draft.store';
import { InMemorySongs, type InMemoryOptions } from '../../../song/in-memory.adapter';
import { SONGS } from '../../../song/tokens';
import { StyleCapture } from './style-capture';

async function draw(options: InMemoryOptions = {}): Promise<{ fixture: ComponentFixture<StyleCapture>; store: SongDraftStore; port: InMemorySongs }> {
  stubStorage();
  TestBed.resetTestingModule();
  const port = new InMemorySongs({ pace: 10, ...options });
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' }), { provide: SONGS, useValue: port }] });
  const fixture = TestBed.createComponent(StyleCapture);
  const store = TestBed.inject(SongDraftStore);
  await settle(fixture);
  return { fixture, store, port };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

const q = <T extends HTMLElement>(f: ComponentFixture<unknown>, sel: string) => (f.nativeElement as HTMLElement).querySelector<T>(sel);

async function importFile(fixture: ComponentFixture<unknown>, name = 'clip.mp4'): Promise<void> {
  const input = q<HTMLInputElement>(fixture, '[data-testid=capture-file]')!;
  Object.defineProperty(input, 'files', { value: [new File(['x'], name)], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

async function type(fixture: ComponentFixture<unknown>, sel: string, value: string): Promise<void> {
  const field = q<HTMLInputElement | HTMLTextAreaElement>(fixture, sel)!;
  field.value = value;
  field.dispatchEvent(new Event('input'));
  await settle(fixture);
}

describe('StyleCapture', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
  });

  it('has both buttons at least as tall as the large control, with room around them', async () => {
    const { fixture } = await draw();
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(styles).toMatch(/\.import[^{]*\{[^}]*min-height:\s*var\(--lab-control-h-lg\)/);
    // the two buttons share one line
    expect(styles).toMatch(/\.actions[^{]*\{[^}]*display:\s*flex/);
    expect(q(fixture, '[data-testid=capture-import]')!.parentElement).toBe(q(fixture, '[data-testid=capture-url-go]')!.parentElement);
    expect(q(fixture, '[data-testid=capture-import]')!.classList).toContain('import');
    expect(q(fixture, '[data-testid=capture-url-go]')!.classList).toContain('import');
  });

  describe('the collapsible', () => {
    const details = (f: ComponentFixture<unknown>) => q<HTMLDetailsElement>(f, '[data-testid=capture]')!;

    it('starts closed, so that the dialog fits its window, and the title opens it', async () => {
      const { fixture } = await draw();
      expect(details(fixture).tagName).toBe('DETAILS');
      expect(details(fixture).open).toBe(false);
      details(fixture).open = true;
      details(fixture).dispatchEvent(new Event('toggle'));
      await settle(fixture);
      expect(details(fixture).open).toBe(true);
    });

    it('opens by itself when something is imported, so that what was heard is seen', async () => {
      const { fixture } = await draw();
      await importFile(fixture);
      expect(details(fixture).open).toBe(true);
    });
  });

  it('takes an audio or a video file', async () => {
    const { fixture } = await draw();
    expect(q<HTMLInputElement>(fixture, '[data-testid=capture-file]')!.accept).toBe('audio/*,video/*');
  });

  describe('the options', () => {
    it('offers the way to recognise the song, the language of the lyrics and what the user knows', async () => {
      const { fixture } = await draw();
      expect(q(fixture, '[data-testid=capture-method]')).toBeTruthy();
      expect(q(fixture, '[data-testid=capture-language]')).toBeTruthy();
      expect(q(fixture, '[data-testid=capture-hint]')).toBeTruthy();
    });

    it('starts with the sound as well when MuQ-MuLan or LAION-CLAP can run, and with the words when none can', async () => {
      const on = await draw();
      expect(q(on.fixture, '[data-testid=capture-method]')!.textContent).toContain('MuQ-MuLan');
      const clap = await draw({ muq: false });
      expect(q(clap.fixture, '[data-testid=capture-method]')!.textContent).toContain('LAION-CLAP');
      const off = await draw({ clap: false, muq: false });
      expect(off.fixture.nativeElement.querySelector('[data-testid=capture-method]').textContent).toContain('Whisper');
    });

    it('labels each way with a few words, and says in two or three why one cannot be used', async () => {
      const { fixture } = await draw({ clap: false });
      // the select is drawn by the form kit: its options are read from the schema it is given
      const schema = (fixture.componentInstance as unknown as { schema(): { fields: { key: string; options: { label: string }[] }[] } }).schema();
      const labels = schema.fields.find((f) => f.key === 'method')!.options.map((o) => o.label);
      expect(labels).toEqual(['Words (Whisper)', 'Sound (LAION-CLAP) (not running)', 'Sound and style (MuQ-MuLan)']);
    });

    it('offers to open the Engines panel when a way to recognise is not running, and not when all can be used or the cause is another', async () => {
      const off = await draw({ clap: false });
      const link = q<HTMLButtonElement>(off.fixture, '[data-testid=capture-open-engines]')!;
      expect(link.textContent).toContain('Open the engines to start it');
      link.click();
      expect(TestBed.inject(MatDialog).getDialogById('engines')).toBeTruthy();
      TestBed.inject(MatDialog).closeAll();
      expect(q((await draw()).fixture, '[data-testid=capture-open-engines]')).toBeNull();
      // MuQ-MuLan without its weights is not something the panel can start
      expect(q((await draw({ muq: false })).fixture, '[data-testid=capture-open-engines]')).toBeNull();
    });

    it('sends the port what was chosen when a file is imported', async () => {
      const { fixture, port } = await draw();
      await type(fixture, '[data-testid=capture-hint]', 'piano, calm');
      await importFile(fixture, 'song.mp3');
      expect(port.lastListen).toEqual({ source: 'song.mp3', options: { method: 'muq', language: '', hint: 'piano, calm' } });
    });

    it('adds the tags of what the user said to the style, first', async () => {
      const { fixture, store } = await draw();
      await type(fixture, '[data-testid=capture-hint]', 'it is jazz with a saxophone');
      await importFile(fixture);
      expect(store.style().split(', ').slice(0, 2)).toEqual(['jazz', 'saxophone']);
    });

    it('imports with MuQ-MuLan when it is the way chosen, and adds what it recognises to the style', async () => {
      const { fixture, store, port } = await draw();
      store.setStyle('blues');
      // the method is part of the form's model: the form is driven by its select, which the specs do not open
      (fixture.componentInstance as unknown as { model: { update(f: (m: Record<string, unknown>) => Record<string, unknown>): void } }).model.update((m) => ({ ...m, method: 'muq' }));
      await settle(fixture);
      await importFile(fixture);
      expect(port.lastListen?.options.method).toBe('muq');
      expect(q(fixture, '[data-testid=capture-error]')).toBeNull();
      expect(store.style().startsWith('blues, ')).toBe(true);
    });
  });

  it('adds the tags it recognises to the style, keeps the ones there and shows what was heard', async () => {
    const { fixture, store } = await draw();
    store.setStyle('blues');
    await importFile(fixture);
    expect(store.style()).toBe('blues, lo-fi, chill, piano, female vocal');
    expect(q(fixture, '[data-testid=capture-heard]')!.textContent).toContain('Chill lo-fi with soft piano');
    expect(q(fixture, '[data-testid=capture-measures]')!.textContent).toContain('92 BPM');
    expect(q(fixture, '[data-testid=capture-measures]')!.textContent).toContain('D minor');
    expect([...fixture.nativeElement.querySelectorAll('[data-testid=capture-added] li')].map((li) => (li as HTMLElement).textContent)).toEqual(['lo-fi', 'chill', 'piano', 'female vocal']);
  });

  it('says no tag was recognised and leaves the style alone', async () => {
    const { fixture, store } = await draw({ vocabulary: { categories: [{ id: 'genre', tags: ['polka'] }], combos: [] } });
    store.setStyle('blues');
    await importFile(fixture);
    expect(q(fixture, '[data-testid=capture-none]')).toBeTruthy();
    expect(store.style()).toBe('blues');
  });

  it('explains why the server could not listen and leaves the style alone', async () => {
    for (const [kind, text] of [['unavailable', 'cannot listen now'], ['tooLong', 'too long or too big'], ['unreadable', 'could not be read'], ['busy', 'busy'], ['timeout', 'too long to listen']] as const) {
      const { fixture, store } = await draw({ listening: kind });
      store.setStyle('blues');
      await importFile(fixture);
      expect(q(fixture, '[data-testid=capture-error]')!.textContent, kind).toContain(text);
      expect(store.style()).toBe('blues');
    }
  });

  it('lets another file be imported after one', async () => {
    const { fixture } = await draw();
    await importFile(fixture, 'one.mp3');
    await importFile(fixture, 'two.mp3');
    expect(q(fixture, '[data-testid=capture-heard]')!.textContent).toContain('two.mp3');
  });

  describe('a YouTube address', () => {
    const go = (fixture: ComponentFixture<unknown>) => q<HTMLButtonElement>(fixture, '[data-testid=capture-url-go]')!;

    it('cannot be captured until it is the address of a YouTube video', async () => {
      const { fixture } = await draw();
      expect(go(fixture).disabled).toBe(true);
      await type(fixture, '[data-testid=capture-url]', 'https://vimeo.com/1');
      expect(go(fixture).disabled).toBe(true);
      await type(fixture, '[data-testid=capture-url]', 'https://youtu.be/abc123');
      expect(go(fixture).disabled).toBe(false);
    });

    it('adds the tags the server gives to the style, with what the user chose, and shows what was heard', async () => {
      const { fixture, store, port } = await draw();
      store.setStyle('blues');
      await type(fixture, '[data-testid=capture-url]', 'https://www.youtube.com/watch?v=abc123');
      go(fixture).click();
      await settle(fixture);
      expect(store.style()).toBe('blues, lo-fi, chill');
      expect(port.lastListen?.options.method).toBe('muq');
      expect(q(fixture, '[data-testid=capture-heard]')).toBeTruthy();
    });

    it('explains why the server could not', async () => {
      const { fixture, store } = await draw({ listening: 'unavailable' });
      store.setStyle('blues');
      await type(fixture, '[data-testid=capture-url]', 'https://youtu.be/abc123');
      go(fixture).click();
      await settle(fixture);
      expect(q(fixture, '[data-testid=capture-error]')!.textContent).toContain('cannot listen now');
      expect(store.style()).toBe('blues');
    });
  });
});
