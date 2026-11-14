import { TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../../testing/memory-storage';
import { stubImageEdit } from '../../testing/retouch';
import { IMAGE_EDIT } from '../retouch/tokens';
import { InMemoryVideoGeneration } from '../video/in-memory.adapter';
import { DEFAULT_SETTINGS, NO_REFERENCES, type GenerationSettings, type ReferenceFile } from '../video/model';
import { VIDEO_GENERATION } from '../video/tokens';
import { CreatePanel } from './create-panel';

const img = { name: 'a.png', dataUrl: 'data:image/png;base64,AA==' };
const ref = (name: string): ReferenceFile => ({ name, blob: new Blob(['x'], { type: 'image/png' }) });

async function setup(settings: GenerationSettings, lang: 'es' | 'en' = 'en') {
  stubStorage({ 'video-studio.lang': lang });
  TestBed.configureTestingModule({
    providers: [provideLabForms({ lang }), { provide: IMAGE_EDIT, useValue: stubImageEdit() }, { provide: VIDEO_GENERATION, useValue: new InMemoryVideoGeneration() }],
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
  const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid=${id}]`);
  const click = async (target: HTMLElement) => {
    target.click();
    await settle();
  };
  const chooseModel = async (name: string) => {
    await click(q('row-model')!);
    await click(Array.from(document.querySelectorAll<HTMLElement>('.settings-menu .mat-mdc-menu-item')).find((o) => o.textContent?.trim() === name)!);
  };
  return { fixture, el, settle, emitted, q, click, chooseModel, panel: fixture.componentInstance as unknown as Record<string, (arg: unknown) => void> };
}

const on = (model: string, over: Partial<GenerationSettings> = {}): GenerationSettings => ({ ...DEFAULT_SETTINGS, model, prompt: 'a fox', ...over });

describe('CreatePanel inputs', () => {
  it('shows a start and an end frame for a model that takes an end image', async () => {
    const { q } = await setup(on('balanced'));
    expect(q('start-frame')).not.toBeNull();
    expect(q('end-frame')).not.toBeNull();
    expect(q('references')).toBeNull();
  });

  it('shows only the start frame for a model that takes nothing else', async () => {
    const { q } = await setup(on('fast'));
    expect(q('start-frame')).not.toBeNull();
    expect(q('end-frame')).toBeNull();
  });

  it('shows the references and no frames for a references model', async () => {
    const { q, el } = await setup(on('reference'));
    expect(q('references')).not.toBeNull();
    expect(q('start-frame')).toBeNull();
    expect(q('end-frame')).toBeNull();
    // the explanation is a bubble on a small ⓘ, which is also the button's accessible name
    expect(el.querySelector('[data-testid=references] [data-testid=info-tip]')?.getAttribute('aria-label')).toContain('<Picture 1>');
  });

  it('keeps the end image when the model changes and brings it back, sending it only to a model that takes one', async () => {
    const { q, chooseModel, click, emitted } = await setup(on('balanced', { startImage: img, endImage: img }));
    await chooseModel('Fast');
    expect(q('end-frame')).toBeNull();
    await click(q('generate')!);
    expect(emitted.at(-1)?.endImage).toBeNull();
    await chooseModel('Balanced');
    expect(q('end-frame')).not.toBeNull();
    await click(q('generate')!);
    expect(emitted.at(-1)?.endImage).toEqual(img);
  });

  it('stops Generate and says why while a references model has no reference image', async () => {
    const { q, settle } = await setup(on('reference'));
    await settle();
    expect((q('generate') as HTMLButtonElement).disabled).toBe(true);
    expect(q('inputs-problem')?.textContent).toContain('At least one reference image');
  });

  it('disables adding at the maximum and says the maximum', async () => {
    const { q } = await setup(on('reference', { references: { images: [ref('1.png'), ref('2.png')], videos: [ref('v.mp4')], audios: [ref('a.mp3')] } }));
    const section = q('references')!;
    expect(section.querySelector<HTMLInputElement>('input[type=file]')!.disabled).toBe(true);
    expect(section.querySelector('[data-testid=max-note]')?.textContent).toContain('maximum');
  });

  it('takes images, videos and audios from one picker and sorts each into its own kind', async () => {
    const { q, settle, emitted, click } = await setup(on('reference'));
    // jsdom never loads media, so the duration read would wait forever: the element says it is ready as soon as it has a source.
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = create(tag);
      if (tag === 'video' || tag === 'audio') {
        Object.defineProperty(el, 'src', { set: () => queueMicrotask(() => (el as HTMLMediaElement).onloadedmetadata?.(new Event('loadedmetadata'))) });
      }
      return el;
    }) as typeof document.createElement);
    const input = q('references')!.querySelector<HTMLInputElement>('input[type=file]')!;
    const files = [new File(['x'], 'a.png', { type: 'image/png' }), new File(['x'], 'v.mp4', { type: 'video/mp4' }), new File(['x'], 'a.mp3', { type: 'audio/mpeg' }), new File(['x'], 'n.txt', { type: 'text/plain' })];
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(async () => {
      await settle();
      expect(q('references')!.querySelectorAll('.tile')).toHaveLength(3);
    });
    expect(q('references-error')?.textContent).toContain('n.txt');
    await click(q('generate')!);
    const refs = emitted[0].references!;
    expect([refs.images.length, refs.videos.length, refs.audios.length]).toEqual([1, 1, 1]);
  });

  it('shows the limits of each kind from the model', async () => {
    const { q } = await setup(on('reference', { references: { ...NO_REFERENCES, images: [ref('1.png')] } }));
    expect(q('references-images')!.textContent).toContain('1 of 2');
    expect(q('references-videos')!.textContent).toContain('up to 2 s each');
    expect(q('references-audios')!.textContent).toContain('up to 3 s each');
  });

  it('sends the references in the order of the list, and lets the first image stand for the prompt', async () => {
    const { q, click, emitted } = await setup(on('reference', { prompt: '', references: { ...NO_REFERENCES, images: [ref('1.png'), ref('2.png')] } }));
    await click(q('generate')!);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].references?.images.map((f) => f.name)).toEqual(['1.png', '2.png']);
    expect(emitted[0].startImage).toBeNull();
  });

  it('says the texts of the references in Spanish', async () => {
    const { q } = await setup(on('reference'), 'es');
    expect(q('references')!.textContent).toContain('Referencias');
    expect(q('references-videos')!.textContent).toContain('hasta 2 s cada uno');
  });

  it('asks to reuse the inputs of a repeated generation until one is changed, then sends the files', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(blob)));
    try {
      const reuse = { of: 'g1', inputs: [{ kind: 'start_image' as const, name: 's.png', url: 'http://server/s.png' }] };
      const { q, click, emitted, panel, settle } = await setup(on('balanced', { reuse }));
      await vi.waitFor(async () => {
        await settle();
        expect(q('inputs-loading')).toBeNull();
      });
      await click(q('generate')!);
      expect(emitted[0].reuse?.of).toBe('g1');
      expect(emitted[0].startImage).toBeNull();
      panel['setImage'](img);
      await settle();
      await click(q('generate')!);
      expect(emitted[1].reuse).toBeUndefined();
      expect(emitted[1].startImage).toEqual(img);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('says so when the files of a repeated generation cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 404 })));
    try {
      const reuse = { of: 'g1', inputs: [{ kind: 'start_image' as const, name: 's.png', url: 'http://server/s.png' }] };
      const { q, settle } = await setup(on('balanced', { reuse }));
      await vi.waitFor(async () => {
        await settle();
        expect(q('inputs-load-failed')).not.toBeNull();
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
