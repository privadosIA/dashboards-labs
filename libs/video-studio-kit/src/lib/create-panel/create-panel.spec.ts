import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../../testing/memory-storage';
import { RETOUCHED, retouchAndUse, stubImageEdit } from '../../testing/retouch';
import { IMAGE_EDIT } from '../retouch/tokens';
import { DEMO_MODELS, InMemoryVideoGeneration } from '../video/in-memory.adapter';
import { DEFAULT_SETTINGS, NO_REFERENCES, type GenerationSettings, type VideoModel } from '../video/model';
import { VIDEO_GENERATION } from '../video/tokens';
import { CreatePanel } from './create-panel';

const RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16'];
const QUALITIES = ['480p', '720p', '1080p'];

async function setup(lang: 'es' | 'en' = 'en', settings: GenerationSettings = { ...DEFAULT_SETTINGS }, video = new InMemoryVideoGeneration()) {
  stubStorage({ 'video-studio.lang': lang });
  TestBed.configureTestingModule({
    providers: [provideLabForms({ lang }), { provide: IMAGE_EDIT, useValue: stubImageEdit() }, { provide: VIDEO_GENERATION, useValue: video }],
  });
  const fixture = TestBed.createComponent(CreatePanel);
  fixture.componentRef.setInput('settings', settings);
  const emitted: GenerationSettings[] = [];
  fixture.componentInstance.generate.subscribe((s) => emitted.push(s));
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  return { fixture, el, settle, emitted, ...controls(el, settle) };
}

/** The library's markup is not ours: controls are found by role and value, not by our own names. The settings rows are ours: found by their test id. */
function controls(el: HTMLElement, settle: () => Promise<void>) {
  const all = <T extends Element>(selector: string) => Array.from(el.querySelectorAll<T>(selector));
  const textarea = () => el.querySelector<HTMLTextAreaElement>('textarea')!;
  const audio = () => el.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  const generate = () => el.querySelector<HTMLButtonElement>('[data-testid=generate]')!;
  const estimate = () => (el.querySelector('.estimate')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const write = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const click = async (target: HTMLElement) => {
    target.click();
    await settle();
  };
  const row = (id: string) => el.querySelector<HTMLButtonElement>(`[data-testid=${id}]`)!;
  const rowValue = (id: string) => row(id).querySelector('.value')?.textContent?.trim();
  const items = () => Array.from(document.querySelectorAll<HTMLElement>('.settings-menu .mat-mdc-menu-item'));
  /** Opens the picker of a row and chooses the option with that text. */
  const pickIn = async (id: string, label: string) => {
    await click(row(id));
    await click(items().find((o) => o.textContent?.trim() === label)!);
  };
  const pick = (value: string) => pickIn(RATIOS.includes(value) ? 'row-aspect' : 'row-quality', value);
  /** Types a duration in the free field of its picker, opening the picker when it is not open. */
  const typeDuration = async (value: string) => {
    if (!document.querySelector('[data-testid=duration-input]')) await click(row('row-duration'));
    await write(document.querySelector<HTMLInputElement>('[data-testid=duration-input]')!, value);
  };
  return { all, textarea, audio, generate, estimate, write, click, row, rowValue, items, pickIn, pick, typeDuration };
}

const image = (type = 'image/png') => new File([new Uint8Array(10)], 'a.png', { type });

describe('CreatePanel', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  it('shows every row with a default selected, and asks for the prompt only when Generate is pressed', async () => {
    const { el, rowValue, audio, generate, click, row, items, emitted } = await setup();
    expect(rowValue('row-duration')).toBe('5 s');
    expect(rowValue('row-aspect')).toBe('16:9');
    expect(rowValue('row-quality')).toBe('720p');
    expect(rowValue('row-model')).toBe(DEMO_MODELS[0].name);
    expect(audio().checked).toBe(true);
    await click(row('row-quality'));
    expect(items().map((o) => o.textContent?.trim())).toEqual(QUALITIES);
    expect(el.querySelectorAll('input[type=radio]')).toHaveLength(0);
    expect(generate().disabled).toBe(false);
    expect(el.textContent).not.toContain('Write a prompt');
    await click(generate());
    expect(emitted).toEqual([]);
    expect(el.textContent).toContain('Write a prompt or choose a start image.');
  });

  it('drops the reason once there is a prompt', async () => {
    const { el, textarea, write, generate, click } = await setup();
    await click(generate());
    expect(el.textContent).toContain('Write a prompt');
    await write(textarea(), 'a fox');
    expect(generate().disabled).toBe(false);
    expect(el.textContent).not.toContain('Write a prompt');
  });

  it('emits the settings chosen when generating', async () => {
    const { textarea, write, pick, click, audio, typeDuration, generate, emitted } = await setup();
    await write(textarea(), 'a fox');
    await pick('9:16');
    await pick('1080p');
    await click(audio());
    await typeDuration('12');
    await click(generate());
    expect(emitted).toEqual([{ ...DEFAULT_SETTINGS, model: 'balanced', prompt: 'a fox', aspectRatio: '9:16', quality: '1080p', audio: false, duration: 12, endImage: null, references: NO_REFERENCES }]);
  });

  it('opens a picker with the current option marked and closes it with Escape, changing nothing', async () => {
    const { row, items, click, rowValue, settle } = await setup();
    await click(row('row-quality'));
    expect(items().find((o) => o.getAttribute('aria-current') === 'true')?.textContent?.trim()).toBe('720p');
    document.querySelector('.mat-mdc-menu-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await vi.waitFor(async () => {
      await settle();
      expect(document.querySelector('.settings-menu')).toBeNull();
    });
    expect(rowValue('row-quality')).toBe('720p');
  });

  it('opens the model picker from the Change button of the header card', async () => {
    const { el, click, items } = await setup();
    expect(el.querySelector('[data-testid=header-model]')?.textContent).toContain(DEMO_MODELS[0].name);
    await click(el.querySelector<HTMLButtonElement>('[data-testid=change-model]')!);
    expect(items().map((o) => o.textContent?.trim())).toContain(DEMO_MODELS[0].name);
  });

  it('emits nothing when the settings are invalid', async () => {
    const { el, settle, emitted } = await setup();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(emitted).toEqual([]);
  });

  describe('the model', () => {
    const choose = async (el: HTMLElement, settle: () => Promise<void>, name: string) => {
      el.querySelector<HTMLElement>('[data-testid=row-model]')!.click();
      await settle();
      Array.from(document.querySelectorAll<HTMLElement>('.settings-menu .mat-mdc-menu-item'))
        .find((o) => o.textContent?.trim() === name)!
        .click();
      await settle();
    };

    it('has the first model of the port selected, with its description as the tooltip of the header card', async () => {
      const { el } = await setup();
      expect(el.querySelector('[data-testid=row-model] .value')?.textContent).toContain(DEMO_MODELS[0].name);
      expect(el.querySelector('[data-testid=header-card]')?.getAttribute('title')).toContain(DEMO_MODELS[0].description);
    });

    it('offers every model of the port', async () => {
      const { el, settle } = await setup();
      el.querySelector<HTMLElement>('[data-testid=row-model]')!.click();
      await settle();
      expect(Array.from(document.querySelectorAll('.settings-menu .mat-mdc-menu-item')).map((o) => o.textContent?.trim())).toEqual(DEMO_MODELS.map((m) => (m.available ? m.name : `${m.name} (unavailable)`)));
    });

    describe('a model that cannot be used', () => {
      const listed: readonly VideoModel[] = [
        { id: 'h3', name: 'H3', description: 'the best', available: false, reason: 'does not fit' },
        { id: 'wan', name: 'Wan', description: 'the usual', available: true },
        { id: 'ltx', name: 'LTX', description: 'with sound', available: true },
      ];
      const withListed = (lang: 'es' | 'en' = 'en') => setup(lang, { ...DEFAULT_SETTINGS }, Object.assign(new InMemoryVideoGeneration(), { models: () => of(listed) }));
      const options = () => Array.from(document.querySelectorAll<HTMLElement>('.settings-menu .mat-mdc-menu-item'));

      it('is listed disabled with the suffix, the first usable one is selected, and it cannot be chosen', async () => {
        const { el, settle, textarea, write, click, generate, emitted } = await withListed();
        expect(el.querySelector('[data-testid=row-model] .value')?.textContent).toContain('Wan');
        el.querySelector<HTMLElement>('[data-testid=row-model]')!.click();
        await settle();
        expect(options().map((o) => o.textContent?.trim())).toEqual(['H3 (unavailable)', 'Wan', 'LTX']);
        expect((options()[0] as HTMLButtonElement).disabled).toBe(true);
        expect((options()[1] as HTMLButtonElement).disabled).toBe(false);
        options()[0].click();
        await settle();
        expect(el.querySelector('[data-testid=row-model] .value')?.textContent).toContain('Wan');
        await write(textarea(), 'a fox');
        await click(generate());
        expect(emitted.map((s) => s.model)).toEqual(['wan']);
      });

      it('writes the suffix in Spanish in a Spanish browser', async () => {
        const { el, settle } = await withListed('es');
        el.querySelector<HTMLElement>('[data-testid=row-model]')!.click();
        await settle();
        expect(options()[0].textContent?.trim()).toBe('H3 (no disponible)');
      });
    });

    it('shows the description of the one chosen and generates with it', async () => {
      const { el, settle, textarea, write, click, generate, emitted } = await setup();
      await choose(el, settle, 'Fast');
      expect(el.querySelector('[data-testid=header-card]')?.getAttribute('title')).toContain('quick drafts');
      await write(textarea(), 'a fox');
      await click(generate());
      expect(emitted.map((s) => s.model)).toEqual(['fast']);
    });

    it('draws before the list of models arrives, and takes the default when it does', async () => {
      const late = new Subject<readonly VideoModel[]>();
      const port = Object.assign(new InMemoryVideoGeneration(), { models: () => late });
      const { el, settle, emitted, click, generate } = await setup('en', { ...DEFAULT_SETTINGS }, port);
      expect(el.querySelector('[data-testid=row-model]')).not.toBeNull();

      late.next([{ id: 'only', name: 'Only', description: 'the one', available: true }]);
      await settle();
      expect(el.querySelector('[data-testid=row-model] .value')?.textContent).toContain('Only');
      expect(el.querySelector('[data-testid=header-card]')?.getAttribute('title')).toContain('the one');
      // The form is drawn again when the list arrives, so the box is looked up again.
      const box = el.querySelector('textarea')!;
      box.value = 'a fox';
      box.dispatchEvent(new Event('input'));
      await settle();
      await click(generate());
      expect(emitted.map((s) => s.model)).toEqual(['only']);
    });

    it('replaces a model the port does not list by its default', async () => {
      const { el, textarea, write, click, generate, emitted } = await setup('en', { ...DEFAULT_SETTINGS, model: 'gone' });
      expect(el.querySelector('[data-testid=row-model] .value')?.textContent).toContain(DEMO_MODELS[0].name);
      await write(textarea(), 'a fox');
      await click(generate());
      expect(emitted.map((s) => s.model)).toEqual([DEMO_MODELS[0].id]);
    });
  });

  describe('the start image', () => {
    const pick = async (el: HTMLElement, settle: () => Promise<void>, file: File) => {
      const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await vi.waitFor(async () => {
        await settle();
        expect(el.querySelector('.preview img')).not.toBeNull();
      });
    };

    it('an image alone is enough to generate, and removing it makes generating refuse again', async () => {
      const { el, settle, generate, click, emitted } = await setup();
      await pick(el, settle, image());
      await click(generate());
      expect(emitted).toHaveLength(1);
      await click(el.querySelector<HTMLButtonElement>('.preview .delete')!);
      expect(el.querySelector('.preview')).toBeNull();
      await click(generate());
      expect(emitted).toHaveLength(1);
    });

    it('sends the retouched image, not the original, and removing it makes generating refuse again', async () => {
      const { el, settle, generate, click, emitted } = await setup();
      await pick(el, settle, image());
      await click(el.querySelector<HTMLButtonElement>('.preview .retouch')!);
      await retouchAndUse(settle, 'as a watercolor', 1);
      expect(el.querySelector<HTMLImageElement>('.preview img')?.src).toBe(RETOUCHED[1].dataUrl);
      await click(generate());
      expect(emitted).toHaveLength(1);
      expect(emitted[0].startImage).toEqual(RETOUCHED[1]);

      await click(el.querySelector<HTMLButtonElement>('.preview .delete')!);
      expect(el.querySelector('.preview')).toBeNull();
      await click(generate());
      expect(emitted).toHaveLength(1);
    });

    it('retouches with the model chosen and sends the result with the video settings', async () => {
      const { el, settle, generate, click, emitted } = await setup();
      await pick(el, settle, image());
      await click(el.querySelector<HTMLButtonElement>('.preview .retouch')!);
      await retouchAndUse(settle, 'as a watercolor', 0, 'blurry', 'Detailed');
      await click(generate());
      expect(emitted[0].startImage).toEqual(RETOUCHED[0]);
    });

    it('does not change the image when the retouch is cancelled', async () => {
      const { el, settle, click, generate, emitted } = await setup();
      await pick(el, settle, image());
      await click(el.querySelector<HTMLButtonElement>('.preview .retouch')!);
      await click(Array.from(document.querySelectorAll<HTMLButtonElement>('app-retouch-dialog .actions button')).find((b) => b.textContent?.trim() === 'Cancel')!);
      await vi.waitFor(async () => {
        await settle();
        expect(document.querySelector('app-retouch-dialog')).toBeNull();
      });
      await click(generate());
      expect(emitted[0].startImage?.dataUrl).toContain('data:image/png');
      expect(emitted[0].startImage?.name).toBe('a.png');
    });

    it('emits the image with the settings', async () => {
      const { el, settle, generate, click, emitted } = await setup();
      await pick(el, settle, image());
      await click(generate());
      expect(emitted).toHaveLength(1);
      expect(emitted[0].startImage).toMatchObject({ name: 'a.png' });
      expect(emitted[0].startImage?.dataUrl).toContain('data:image/png');
    });
  });

  describe('the duration', () => {
    it.each(['3', '31', '4.5'])('refuses %s: generate is unavailable and the field says what is accepted', async (value) => {
      const { el, textarea, typeDuration, write, generate } = await setup();
      await write(textarea(), 'a fox');
      await typeDuration(value);
      expect(generate().disabled).toBe(true);
      expect(el.textContent).toMatch(/duration must be/i);
    });

    it.each(['4', '30'])('accepts %s', async (value) => {
      const { textarea, typeDuration, write, generate } = await setup();
      await write(textarea(), 'a fox');
      await typeDuration(value);
      expect(generate().disabled).toBe(false);
    });
  });

  describe('the sound', () => {
    const choose = async (el: HTMLElement, settle: () => Promise<void>, name: string) => {
      el.querySelector<HTMLElement>('[data-testid=row-model]')!.click();
      await settle();
      Array.from(document.querySelectorAll<HTMLElement>('.settings-menu .mat-mdc-menu-item'))
        .find((o) => o.textContent?.trim() === name)!
        .click();
      await settle();
    };
    const field = (el: HTMLElement) => el.querySelector<HTMLTextAreaElement>('[data-testid=sound]');
    const text = (el: HTMLElement, id: string) => el.querySelector(`[data-testid=${id}]`)?.textContent?.replace(/\s+/g, ' ').trim();

    it('has Audio enabled and ticked, and the Sound field shown, with a model that writes sound', async () => {
      const { el, audio } = await setup();
      expect(audio().disabled).toBe(false);
      expect(audio().checked).toBe(true);
      expect(field(el)).toBeTruthy();
      expect(el.textContent).toContain('Sound (optional)');
      expect(el.querySelector('[data-testid=sound-off]')).toBeNull();
    });

    it('unticks and disables Audio with a note, and hides the Sound field, with a model that makes no sound', async () => {
      const { el, settle, audio } = await setup();
      await choose(el, settle, 'Fast');
      expect(audio().checked).toBe(false);
      expect(audio().disabled).toBe(true);
      expect(text(el, 'sound-off')).toBe('This model makes no sound.');
      expect(field(el)).toBeNull();
    });

    it('enables Audio again, ticked, when the model changes back to one that writes sound', async () => {
      const { el, settle, audio } = await setup();
      await choose(el, settle, 'Fast');
      await choose(el, settle, 'Balanced');
      expect(audio().disabled).toBe(false);
      expect(audio().checked).toBe(true);
      expect(el.querySelector('[data-testid=sound-off]')).toBeNull();
      expect(field(el)).toBeTruthy();
    });

    it('keeps what the person chose for Audio while the model does not change', async () => {
      const { el, audio, click } = await setup();
      await click(audio());
      expect(audio().checked).toBe(false);
      expect(field(el)).toBeNull();
    });

    it('hides the Sound field while Audio is off and keeps its text for when it is ticked again', async () => {
      const { el, audio, click, write } = await setup();
      await write(field(el)!, 'rain');
      await click(audio());
      expect(field(el)).toBeNull();
      await click(audio());
      expect(field(el)!.value).toBe('rain');
    });

    it('emits the sound with the settings', async () => {
      const { el, textarea, write, click, generate, emitted } = await setup();
      await write(textarea(), 'a fox');
      await write(field(el)!, 'wind and soft piano');
      await click(generate());
      expect(emitted[0]).toMatchObject({ prompt: 'a fox', sound: 'wind and soft piano', audio: true });
      expect('soundable' in emitted[0]).toBe(false);
    });

    it('shows how many characters remain of the 2000 shared with the prompt', async () => {
      const { el, textarea, write } = await setup();
      await write(textarea(), 'a fox');
      await write(field(el)!, 'rain');
      // "a fox Sound: rain" is 17 characters
      expect(text(el, 'sound-count')).toBe('1983 characters left of 2000');
    });

    it('says how many characters are over and cannot generate when the prompt and the sound are too long together', async () => {
      const { el, textarea, write, generate, click, emitted } = await setup();
      await write(textarea(), 'x'.repeat(1995));
      await write(field(el)!, 'rain');
      // "xxxx… Sound: rain" is 1995 + 1 + 11 = 2007 characters
      expect(text(el, 'prompt-too-long')).toBe('The prompt and the sound are 7 characters over the 2000 limit.');
      expect(generate().disabled).toBe(true);
      await click(generate());
      expect(emitted).toEqual([]);
    });

    it('does not count the sound when the model makes none', async () => {
      const { el, settle, textarea, write, generate } = await setup();
      await write(textarea(), 'x'.repeat(1995));
      await write(field(el)!, 'rain');
      await choose(el, settle, 'Fast');
      expect(el.querySelector('[data-testid=prompt-too-long]')).toBeNull();
      expect(generate().disabled).toBe(false);
    });

    it('is in Spanish in Spanish', async () => {
      const { el, settle } = await setup('es');
      expect(el.textContent).toContain('Sonido (opcional)');
      await choose(el, settle, 'Fast');
      expect(text(el, 'sound-off')).toBe('Este modelo no genera sonido.');
    });
  });

  describe('the layout', () => {
    it('scrolls the form inside the panel and keeps the estimate and Generate in a foot outside the scroll area', async () => {
      const { el, generate, estimate } = await setup();
      const foot = el.querySelector('.foot')!;
      const scroll = el.querySelector('.scroll')!;
      expect(scroll.querySelector('dynamic-form')).toBeTruthy();
      expect(scroll.contains(generate())).toBe(false);
      expect(foot.contains(generate())).toBe(true);
      expect(foot.querySelector('.estimate')?.textContent).toContain(estimate().slice(0, 8));
    });

    it('has Generate as a quiet surface while it cannot be used (a duration that is refused), and as large as the music studio\'s', async () => {
      const { generate, typeDuration } = await setup();
      await typeDuration('31');
      const styles = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
      expect(styles).toMatch(/\.generate[^{]*\{[^}]*height:\s*3rem/);
      expect(styles).toMatch(/\.generate[^{]*:disabled[^{]*\{[^}]*var\(--lab-surface-high\)/);
      expect(generate().disabled).toBe(true);
    });
  });

  describe('the estimate', () => {
    it('follows the duration without generating anything', async () => {
      const { typeDuration, estimate, emitted } = await setup();
      const before = estimate();
      await typeDuration('20');
      expect(estimate()).not.toBe(before);
      expect(estimate()).toMatch(/^.+ · [\d.]+ MB$/);
      expect(emitted).toEqual([]);
    });

    it.each(['', '31'])('shows a dash while the duration is %j', async (value) => {
      const { typeDuration, estimate } = await setup();
      await typeDuration(value);
      expect(estimate()).toBe('–');
    });
  });

  describe('the settings pushed by the page', () => {
    it('are loaded into the controls, without generating', async () => {
      const { fixture, settle, textarea, rowValue, audio, el, emitted } = await setup();
      const next: GenerationSettings = {
        prompt: 'a heron',
        startImage: { name: 'b.png', dataUrl: 'data:image/png;base64,AAAA' },
        model: 'fast',
        duration: 18,
        aspectRatio: '1:1',
        quality: '480p',
        audio: false,
      };
      fixture.componentRef.setInput('settings', next);
      await settle();
      expect(textarea().value).toBe('a heron');
      expect(rowValue('row-duration')).toBe('18 s');
      expect(rowValue('row-aspect')).toBe('1:1');
      expect(rowValue('row-quality')).toBe('480p');
      expect(audio().checked).toBe(false);
      expect(el.querySelector<HTMLImageElement>('.preview img')?.src).toContain('data:image/png');
      expect(emitted).toEqual([]);
    });
  });

  describe('the language', () => {
    it('gives the reason in English in an English browser', async () => {
      const { el, generate, click } = await setup('en');
      await click(generate());
      expect(el.textContent).toContain('Write a prompt or choose a start image.');
    });

    it('gives the duration message in Spanish in a Spanish browser', async () => {
      const { typeDuration, el } = await setup('es');
      await typeDuration('31');
      expect(el.textContent).toContain('La duración debe estar entre 4 y 30 segundos.');
    });
  });
});

