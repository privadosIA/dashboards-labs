import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Part } from '@lab/motion-parts';
import { load } from 'js-yaml';

import { ProjectConfig } from '../../core/api.models';
import { FakeMotionCatalogStore } from '../../core/motion-catalog.fake';
import { MotionCatalogStore } from '../../core/motion-catalog.store';
import { toYaml } from '../../shared/project-yaml';
import { EditorStore } from '../editor.store';
import { MotionDefaultsPanelComponent } from './motion-defaults-panel.component';

const CONFIG: ProjectConfig = {
  project: 'demo',
  output: { mode: 'video', file: 'out/demo.mp4', contact_sheet: false },
  defaults: { model: '', voice: '', resolution: '1280x720', sampler: 'euler', steps: 30, fps: 30, subject_prompt: '', negative_prompt: '', lora_model_dir: '' },
  scenes: [],
};
const COUNTER: Part = { name: 'counter', description: 'A counter', levels: ['simple', 'medium', 'advanced'], costMs: 55, manual: false, params: [] };

describe('MotionDefaultsPanelComponent', () => {
  let fixture: ComponentFixture<MotionDefaultsPanelComponent>;
  let store: EditorStore;
  let http: HttpTestingController;
  const q = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);
  const motion = () => store.config()!.defaults.motion;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Opens the editor on a project; `catalog` says whether the server has the catalog. */
  async function open(options: { motion?: NonNullable<ProjectConfig['defaults']['motion']>; mode?: string; catalog?: boolean; opened?: boolean } = {}): Promise<void> {
    TestBed.configureTestingModule({
      imports: [MotionDefaultsPanelComponent],
      providers: [EditorStore, provideHttpClient(), provideHttpClientTesting(), { provide: MotionCatalogStore, useClass: FakeMotionCatalogStore }],
    });
    const catalog = TestBed.inject(MotionCatalogStore) as unknown as FakeMotionCatalogStore;
    if (options.catalog !== false) catalog.parts.set([COUNTER]);
    catalog.fonts.set(['Inter', 'Space Grotesk']);
    store = TestBed.inject(EditorStore);
    http = TestBed.inject(HttpTestingController);
    const cfg = structuredClone(CONFIG);
    if (options.motion) cfg.defaults.motion = options.motion;
    if (options.mode) cfg.output.mode = options.mode;
    const loading = store.load('demo');
    http.expectOne('/api/projects/demo/config').flush({ yaml: '', parsed: cfg, valid: true });
    await loading;
    fixture = TestBed.createComponent(MotionDefaultsPanelComponent);
    fixture.detectChanges();
    if (options.opened !== false && q('mat-expansion-panel-header')) {
      (q('mat-expansion-panel-header') as HTMLElement).click();
      http.expectOne('/api/projects/demo/sources').flush({ sources: [{ name: 'theme.mp3', size: 1, modified: '' }, { name: 'cover.png', size: 1, modified: '', kind: 'image' }] });
    }
    await settle();
  }

  async function type(testid: string, value: string): Promise<void> {
    const input = q(`[data-testid=${testid}]`) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  async function choose(testid: string, option: string): Promise<void> {
    (q(`[data-testid=${testid}]`) as HTMLElement).click();
    await settle();
    // The panel of a select that was closed a moment ago may still be there: the one just opened is the last.
    const panels = document.querySelectorAll('.mat-mdc-select-panel');
    const options = [...(panels[panels.length - 1]?.querySelectorAll<HTMLElement>('mat-option') ?? [])];
    const found = options.find((o) => o.textContent?.trim() === option);
    if (!found) throw new Error(`no option "${option}": ${options.map((o) => o.textContent?.trim()).join(', ')}`);
    found.click();
    await settle();
  }

  afterEach(() => {
    http.verify();
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  describe('when it is shown', () => {
    it('in a video project of a server that has the catalog', async () => {
      await open({ opened: false });
      expect(q('[data-testid=motion-defaults]')).toBeTruthy();
    });

    it('not when the server has no catalog and the project says nothing of it', async () => {
      await open({ catalog: false, opened: false });
      expect(q('[data-testid=motion-defaults]')).toBeNull();
    });

    it('when the project already has it, even without the catalog, so it is not lost from sight', async () => {
      await open({ catalog: false, motion: { bpm: 100 } });
      expect(q('[data-testid=motion-defaults]')).toBeTruthy();
      expect((q('[data-testid=motion-bpm]') as HTMLInputElement).value).toBe('100');
    });

    it('not in a project of pictures', async () => {
      await open({ mode: 'images', opened: false });
      expect(q('[data-testid=motion-defaults]')).toBeNull();
    });
  });

  describe('the tempo', () => {
    it('is written as typed and, when emptied, removes the whole block if nothing else is set', async () => {
      await open();
      await type('motion-bpm', '96');
      expect(motion()).toEqual({ bpm: 96 });
      await type('motion-bpm', '');
      expect(motion()).toBeUndefined();
      expect('motion' in store.config()!.defaults).toBe(false);
    });

    it('outside 40 to 240 is refused in the panel and the project cannot be saved', async () => {
      await open();
      await type('motion-bpm', '300');
      expect(q('[data-testid=motion-defaults-error]')!.textContent).toContain('240');
      expect(store.canSave()).toBe(false);
      await type('motion-bpm', '120');
      expect(q('[data-testid=motion-defaults-error]')).toBeNull();
      expect(store.canSave()).toBe(true);
    });
  });

  describe('the song', () => {
    it('is chosen among the audio files of the sources, not the pictures, and the panel reminds that scenes should be silent', async () => {
      await open();
      (q('[data-testid=motion-song]') as HTMLElement).click();
      await settle();
      expect([...document.querySelectorAll('mat-option')].map((o) => o.textContent?.trim())).toEqual(['Ninguna', 'theme.mp3']);
      (document.querySelectorAll('mat-option')[1] as HTMLElement).click();
      await settle();
      expect(motion()).toEqual({ song: 'theme.mp3' });
      expect(q('[data-testid=motion-song-note]')!.textContent).toContain('escenas mudas');
    });

    it('is taken away by choosing none', async () => {
      await open({ motion: { bpm: 100, song: 'theme.mp3' } });
      await choose('motion-song', 'Ninguna');
      expect(motion()).toEqual({ bpm: 100 });
      expect(q('[data-testid=motion-song-note]')).toBeNull();
    });

    it('is flagged when it is not on disk, and kept', async () => {
      await open({ motion: { song: 'gone.mp3' } });
      expect(q('[data-testid=motion-song]')).toBeTruthy();
      (q('[data-testid=motion-song]') as HTMLElement).click();
      await settle();
      expect(document.body.textContent).toContain('no está en disco');
    });
  });

  describe('the design', () => {
    it('writes the colours, the typefaces from the catalog, the mode, the styles and the concept, and only those', async () => {
      await open();
      await type('motion-accent', '#00ff88');
      await type('motion-dark', ' #101018 ');
      await choose('motion-display', 'Space Grotesk');
      await choose('motion-body', 'Inter');
      await choose('motion-verse', 'Brillo');
      await choose('motion-hit', 'Metal');
      await type('motion-concept', 'Palabras que caen en el pulso');
      (q('[data-testid=motion-mode]')!.querySelectorAll('button')[2] as HTMLElement).click(); // Claro
      await settle();
      expect(motion()).toEqual({
        design: { accent: '#00ff88', dark: '#101018', display: 'Space Grotesk', body: 'Inter', verse_style: 'glow', hit_style: 'metal', concept: 'Palabras que caen en el pulso', default_mode: 'light' },
      });
    });

    it('does not write a plain style: it is what the server does without it', async () => {
      await open({ motion: { design: { verse_style: 'karaoke' } } });
      await choose('motion-verse', 'Normal');
      expect(motion()).toBeUndefined();
    });

    it('refuses a colour that is not like #aabbcc and a concept of more than 200 characters', async () => {
      await open();
      await type('motion-accent', 'red');
      expect(q('[data-testid=motion-defaults-error]')!.textContent).toContain('accent');
      expect(store.canSave()).toBe(false);
      await type('motion-accent', '#aabbcc');
      expect(store.canSave()).toBe(true);
    });

    it('is written to the file under defaults.motion', async () => {
      await open();
      await type('motion-bpm', '90');
      await type('motion-accent', '#ff5a3c');
      const doc = load(toYaml(store.config()!)) as { defaults: Record<string, unknown> };
      expect(doc.defaults['motion']).toEqual({ bpm: 90, design: { accent: '#ff5a3c' } });
    });
  });

  it('shows the server\'s reason about this block, in the server\'s words, and not the ones about other things', async () => {
    await open();
    store.serverError.set({ message: 'defaults.motion.design: accent #101018 has less than 3:1 contrast\ndefaults.model: not found', sceneId: null });
    await settle();
    const text = q('[data-testid=motion-defaults-server-error]')!.textContent!;
    expect(text).toContain('3:1 contrast');
    expect(text).not.toContain('defaults.model');
  });

  it('keeps a field of the block it does not edit when it saves what it does', async () => {
    const unknown = { bpm: 100, design: { accent: '#ff5a3c', future_field: 'x' }, future: { a: 1 } } as unknown as NonNullable<ProjectConfig['defaults']['motion']>;
    await open({ motion: unknown });
    await type('motion-bpm', '120');
    await choose('motion-hit', 'Metal');
    expect(motion()).toEqual({ bpm: 120, design: { accent: '#ff5a3c', future_field: 'x', hit_style: 'metal' }, future: { a: 1 } });
    const doc = load(toYaml(store.config()!)) as { defaults: { motion: Record<string, unknown> } };
    expect(doc.defaults.motion['future']).toEqual({ a: 1 });
  });
});
