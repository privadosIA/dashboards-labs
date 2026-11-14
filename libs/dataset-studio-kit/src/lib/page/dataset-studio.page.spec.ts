import { type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ANIMATION } from '@lab/animation-core';
import { DATASET_PORT, InMemoryDataset } from '@lab/dataset-import';
import { provideLabForms } from '@lab/forms-kit';
import { NEVER, of } from 'rxjs';

import { ASSIST_PROVIDERS } from '@lab/assist-kit';
import { FAKE_BUILTIN, FAKE_ROUTER, FakeProviders } from '@lab/assist-kit/testing';
import { DatasetStudioNav } from '../nav/dataset-studio-nav';
import { MemoryWriter, WRITER, type WriterPort } from '../generate/writer';
import { provideDatasetStudio } from '../provide-dataset-studio';
import { datasetStudioRoutes } from '../routes';
import { DRAFT_KEY, DRAFT_STORAGE, type DraftStorage } from './draft-storage';
import { AssistantChoice } from '../core/assistant-choice';
import { DatasetStudioPage } from './dataset-studio.page';

const animation = (features: string[] = []) =>
  ({
    catalog: () => of({ parts: [{}, {}], fonts: ['Inter'], styles: ['typographic'], levels: ['simple'], frameRates: [30], features }),
    assistModels: () => of({ default: 'qwen3:8b', models: [{ name: 'qwen3:8b', sizeBytes: 1, fits: true }] }),
    plan: () => of({ song: { title: 'City', caption: '', lyrics: '', tags: '', instrumental: true, seconds: 60 }, animation: { style: 'typographic', level: 'simple', fps: 30, mode: 'dark', concept: 'c', prompt: '' }, parts: [], warnings: [] }),
    songs: () => of([]),
    references: () => of([]),
    presets: () => of([]),
    drafts: () => of([]),
    pieces: () => of([]),
  }) as never;

async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }, rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 6));
  }
}
type Internals = { step: WritableSignal<string>; pinned: () => readonly unknown[]; brief: WritableSignal<string>; negative: WritableSignal<string>; options: WritableSignal<Record<string, unknown>>; raw: () => string; kindId: () => string };

const memoryStorage = (): DraftStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};
let storage = memoryStorage();

async function create(options: { lang?: 'es' | 'en'; writer?: WriterPort; features?: string[]; providers?: FakeProviders } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideLabForms({ lang: options.lang ?? 'en' }),
      provideRouter([]),
      { provide: DRAFT_STORAGE, useValue: storage },
      { provide: ANIMATION, useValue: animation(options.features) },
      { provide: DATASET_PORT, useValue: new InMemoryDataset() },
      provideDatasetStudio({ lang: options.lang ?? 'en', memory: true, debounceMs: 0 }),
      ...(options.writer ? [{ provide: WRITER, useValue: options.writer }] : []),
      ...(options.providers ? [{ provide: ASSIST_PROVIDERS, useValue: options.providers }] : []),
    ],
  });
  const fixture = TestBed.createComponent(DatasetStudioPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const page = fixture.componentInstance as unknown as Internals;
  return { fixture, el, page };
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: HTMLElement, id: string) => (q(el, id) as HTMLElement).click();

describe('DatasetStudioPage (memory)', () => {
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('Songs end to end: pick, write a brief, generate, read the report and Create names the Music studio', async () => {
    const { fixture, el, page } = await create();
    click(el, 'kind-songs');
    await settle(fixture);
    expect(q(el, 'kind-detail')!.textContent).toContain('A list of tracks');
    expect(q(el, 'engine-heartmula')).not.toBeNull();
    page.brief.set('summer pop on the beach');
    await settle(fixture);
    expect((q(el, 'generate') as HTMLButtonElement).disabled).toBe(false);
    click(el, 'generate');
    await settle(fixture);
    expect(JSON.parse(page.raw())).toHaveLength(1);
    expect(q(el, 'server-counts')!.textContent).toMatch(/1\s*Entries\s*1\s*Imported/);
    await settle(fixture);
    (q(el, 'create') as HTMLButtonElement).click();
    await settle(fixture);
    expect(q(el, 'created')!.textContent).toContain('the Music studio');
    expect(q(el, 'created')!.textContent).toContain('summer-pop-on-the-beach');
  });

  it('generates again for a song and appends the second track', async () => {
    const { fixture, el, page } = await create();
    click(el, 'kind-songs');
    page.brief.set('first song');
    await settle(fixture);
    click(el, 'generate');
    await settle(fixture);
    page.brief.set('second song');
    await settle(fixture);
    expect(q(el, 'generate')!.textContent).toContain('Generate another');
    click(el, 'generate');
    await settle(fixture);
    expect(JSON.parse(page.raw())).toHaveLength(2);
  });

  it('Video in one line per scene: shows the mode, writes one entry per scene and the server counts them', async () => {
    const { fixture, el, page } = await create();
    expect(q(el, 'brief-mode')!.textContent).toContain('One line per scene');
    page.brief.set('the hive at dawn\nthe bee says "good morning"\n- the meadow');
    await settle(fixture);
    expect(q(el, 'brief-calls')!.textContent).toContain('3 scenes → 3 assistant calls');
    click(el, 'generate');
    await settle(fixture);
    expect(JSON.parse(page.raw())).toHaveLength(3);
    expect(q(el, 'server-counts')!.textContent).toMatch(/3\s*Entries/);
    expect(q(el, 'cell-Silence-2')).not.toBeNull();
  });

  it('with the server listing the dataset feature the video kind is one sentence', async () => {
    const { el } = await create({ features: ['plan', 'dataset'] });
    expect(q(el, 'brief-mode')!.textContent).toContain('One sentence');
  });

  it('keeps Generate off over the limit, with the reason', async () => {
    const { fixture, el, page } = await create();
    page.brief.set('x'.repeat(2100));
    await settle(fixture);
    expect((q(el, 'generate') as HTMLButtonElement).disabled).toBe(true);
    expect(q(el, 'why-off')!.textContent).toContain('2000');
    expect(q(el, 'brief-counter')!.textContent).toContain('2100 / 2000');
  });

  it('shows progress while it works and keeps what was written when stopped', async () => {
    const writer: WriterPort = { image: () => NEVER, motion: () => NEVER, music: () => NEVER, dataset: () => NEVER };
    const { fixture, el, page } = await create({ writer });
    page.brief.set('one\ntwo');
    await settle(fixture);
    click(el, 'generate');
    await settle(fixture);
    expect(q(el, 'progress')!.textContent).toContain('Writing… 0 of 2');
    click(el, 'stop');
    await settle(fixture);
    expect(q(el, 'stopped')).not.toBeNull();
    expect(q(el, 'progress')).toBeNull();
    expect((q(el, 'generate') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says in words when the assistant fails', async () => {
    const { GenerateFailed } = await import('../generate/writer');
    const { throwError } = await import('rxjs');
    const mem = new MemoryWriter();
    const writer: WriterPort = { image: () => throwError(() => new GenerateFailed('busy')), motion: (i) => mem.motion(i), music: (i) => mem.music(i), dataset: (i) => mem.dataset(i) };
    const { fixture, el, page } = await create({ writer });
    page.brief.set('one');
    await settle(fixture);
    click(el, 'generate');
    await settle(fixture);
    expect(q(el, 'generate-failed')!.textContent).toContain('The server is drawing something else');
  });

  it('inserts a preset into the brief, pins examples and says how many are sent', async () => {
    const { fixture, el, page } = await create();
    click(el, 'insert-sample-6');
    await settle(fixture);
    expect(page.brief()).toContain('wooden beehive');
    click(el, 'pin-sample-7');
    await settle(fixture);
    expect(q(el, 'examples-note')!.textContent).toContain('The example you pinned is sent');
    expect(q(el, 'generate')!.textContent).toContain('with 1 example');
  });

  it('sends no example by match when the server does not take them, only the ones the person pins, and by match when it does', async () => {
    const a = await create();
    a.page.brief.set('the hive at dawn, wide shot of a wooden beehive');
    await settle(a.fixture);
    expect(q(a.el, 'examples-note')!.textContent).toContain('does not take examples picked by match');
    expect(q(a.el, 'generate')!.textContent).not.toContain('examples');
    const b = await create({ features: ['plan', 'examples'] });
    b.page.brief.set('the hive at dawn, wide shot of a wooden beehive');
    await settle(b.fixture);
    expect(q(b.el, 'examples-note')!.textContent).toContain('presets that match best are sent');
  });

  it('without an Ollama to talk to and no provider chosen, says to go to Providers and keeps Generate off; with one chosen it writes with it', async () => {
    const mem = new MemoryWriter();
    const asked: (string | undefined)[] = [];
    const writer: WriterPort = { image: (i) => (asked.push(i.provider), mem.image(i)), motion: (i) => mem.motion(i), music: (i) => mem.music(i), dataset: (i) => mem.dataset(i) };
    const { fixture, el, page } = await create({ writer, providers: new FakeProviders([FAKE_BUILTIN, FAKE_ROUTER], false) });
    page.brief.set('a neon street');
    await settle(fixture);
    expect(q(el, 'no-assistant')).not.toBeNull();
    expect(q(el, 'go-providers')!.getAttribute('href')).toBe('/providers');
    expect((q(el, 'generate') as HTMLButtonElement).disabled).toBe(true);
    // what the Providers tab hands over once the person chose (and consented to) an external provider
    TestBed.inject(AssistantChoice).value.set({ provider: 'router', model: 'gpt-x' });
    await settle(fixture);
    expect(q(el, 'no-assistant')).toBeNull();
    expect(q(el, 'external-mark')!.textContent).toContain('"My router" is external');
    click(el, 'generate');
    await settle(fixture);
    expect(asked).toEqual(['router']);
  });

  it('saves the brief as a preset of the person\'s own', async () => {
    const { fixture, el, page } = await create();
    click(el, 'kind-songs');
    page.brief.set('a calm jazz tune');
    await settle(fixture);
    click(el, 'generate');
    await settle(fixture);
    click(el, 'save-preset');
    await settle(fixture);
    expect(q(el, 'preset-note')!.textContent).toContain('Saved as a preset');
    expect(el.textContent).toContain('a calm jazz tune');
  });

  it('offers the draft of last time and restores or discards it', async () => {
    storage.setItem(DRAFT_KEY, JSON.stringify({ kind: 'images', brief: 'a neon street', negative: 'blur', look: '', raws: {} }));
    const a = await create();
    expect(q(a.el, 'draft-found')).not.toBeNull();
    click(a.el, 'draft-restore');
    await settle(a.fixture);
    expect(a.page.brief()).toBe('a neon street');
    expect(a.page.negative()).toBe('blur');
    expect(a.page.kindId()).toBe('images');
    expect(q(a.el, 'draft-found')).toBeNull();

    storage.setItem(DRAFT_KEY, JSON.stringify({ kind: 'images', brief: 'old', negative: '', look: '', raws: {} }));
    const b = await create();
    click(b.el, 'draft-discard');
    await settle(b.fixture);
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
    expect(b.page.brief()).toBe('');
  });

  it('keeps the brief as the person writes it, once no draft is waiting', async () => {
    const { fixture, page } = await create();
    page.brief.set('remember me');
    await settle(fixture);
    expect(JSON.parse(storage.getItem(DRAFT_KEY)!)).toMatchObject({ brief: 'remember me', kind: 'video' });
  });

  describe('steps and the assistant bar', () => {
    const visible = (el: HTMLElement) => ['brief', 'presets', 'generate', 'result'].filter((id) => !el.querySelector<HTMLElement>(`#panel-${id}`)!.hidden);

    it('opens on the brief with one step shown, and says which assistant writes with a link to change it', async () => {
      const { el } = await create();
      expect(visible(el)).toEqual(['brief']);
      expect(q(el, 'assistant-summary')!.textContent).toContain('as the server routes it');
      expect(q(el, 'change-assistant')!.getAttribute('href')).toBe('/providers');
      expect(el.querySelector('lab-assistant-picker')).toBeNull();
    });

    it('puts the kind first, then the brief, and the engines folded away', async () => {
      const { el } = await create();
      const order = ['kind-video', 'brief', 'engines-details'].map((id) => q(el, id) ?? el.querySelector('lab-brief')!);
      for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect((q(el, 'engines-details') as HTMLDetailsElement).open).toBe(false);
      expect((q(el, 'kind-more') as HTMLDetailsElement).open).toBe(false);
    });

    it('moves between the steps with the bar and the bar tells which have content', async () => {
      const { fixture, el, page } = await create();
      expect(q(el, 'step-brief')!.textContent).not.toContain('has content');
      page.brief.set('a neon street');
      await settle(fixture);
      expect(q(el, 'step-brief')!.textContent).toContain('has content');
      click(el, 'step-presets');
      await settle(fixture);
      expect(visible(el)).toEqual(['presets']);
      expect(q(el, 'step-presets')!.getAttribute('aria-selected')).toBe('true');
    });

    it('moves with the arrow keys', async () => {
      const { fixture, el, page } = await create();
      q(el, 'step-brief')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle(fixture);
      expect(page.step()).toBe('presets');
      q(el, 'step-presets')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await settle(fixture);
      expect(page.step()).toBe('result');
    });

    it('keeps the pinned presets and the brief when the step changes, and the brief says how many are pinned', async () => {
      const { fixture, el, page } = await create();
      click(el, 'step-presets');
      click(el, 'pin-sample-7');
      await settle(fixture);
      click(el, 'back-to-brief');
      await settle(fixture);
      expect(visible(el)).toEqual(['brief']);
      expect(page.pinned()).toHaveLength(1);
      expect(q(el, 'pinned-note')!.textContent).toContain('1 preset is pinned');
      click(el, 'open-presets');
      await settle(fixture);
      expect(visible(el)).toEqual(['presets']);
    });

    it('inserting a preset goes back to the brief with it written', async () => {
      const { fixture, el, page } = await create();
      click(el, 'step-presets');
      click(el, 'insert-sample-6');
      await settle(fixture);
      expect(visible(el)).toEqual(['brief']);
      expect(page.brief()).toContain('wooden beehive');
    });

    it('Generate with no brief is off with the reason and a link to the brief', async () => {
      const { fixture, el, page } = await create();
      click(el, 'step-generate');
      await settle(fixture);
      expect((q(el, 'generate') as HTMLButtonElement).disabled).toBe(true);
      click(el, 'to-brief');
      await settle(fixture);
      expect(page.step()).toBe('brief');
    });

    it('goes to the result when a generation finishes', async () => {
      const { fixture, el, page } = await create();
      click(el, 'kind-songs');
      page.brief.set('summer pop on the beach');
      click(el, 'step-generate');
      await settle(fixture);
      click(el, 'generate');
      await settle(fixture);
      expect(page.step()).toBe('result');
      expect(visible(el)).toEqual(['result']);
    });

    it('keeps the step in the draft and a draft restored opens on it; an old draft opens on the brief', async () => {
      const a = await create();
      a.page.brief.set('remember me');
      click(a.el, 'step-generate');
      await settle(a.fixture);
      expect(JSON.parse(storage.getItem(DRAFT_KEY)!)).toMatchObject({ step: 'generate' });

      const b = await create();
      click(b.el, 'draft-restore');
      await settle(b.fixture);
      expect(b.page.step()).toBe('generate');

      storage.setItem(DRAFT_KEY, JSON.stringify({ kind: 'images', brief: 'old', negative: '', look: '', raws: {} }));
      const c = await create();
      click(c.el, 'draft-restore');
      await settle(c.fixture);
      expect(c.page.step()).toBe('brief');
    });
  });

  it('speaks Spanish when the host does', async () => {
    const { el } = await create({ lang: 'es' });
    expect(q(el, 'kind-detail')!.textContent).toContain('Una lista de escenas');
    expect(q(el, 'generate')!.textContent).toContain('Generar');
  });
});

describe('the nav and the routes', () => {
  it('links to the generator and the presets under the base the host gives', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ANIMATION, useValue: animation() }, { provide: DATASET_PORT, useValue: new InMemoryDataset() }, provideDatasetStudio({ lang: 'en', memory: true })] });
    const fixture = TestBed.createComponent(DatasetStudioNav);
    fixture.componentRef.setInput('base', '/dataset');
    await settle(fixture);
    const hrefs = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/dataset/studio', '/dataset/providers', '/dataset/presets']);
  });

  it('has the generator, the providers and the presets, and the root leads to the generator', () => {
    const [root] = datasetStudioRoutes({ base: '/dataset' });
    expect(root.children!.map((r) => r.path)).toEqual(['', 'studio', 'providers', 'presets']);
    expect(root.children![0].redirectTo).toBe('studio');
  });
});
