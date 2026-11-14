import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom, of, throwError } from 'rxjs';

import { stubStorage } from '../../../testing/memory-storage';
import { MotionLibraryDialog } from '../../motion-library-dialog/motion-library.dialog';
import { InMemoryMotionLibrary } from '../../motions/in-memory.adapter';
import type { Motion } from '../../motions/model';
import { MOTION_LIBRARY } from '../../motions/tokens';
import type { MotionLibraryPort } from '../../motions/port';
import { DEMO_TOOLS, InMemoryVideoEdit } from '../../video-edit/in-memory.adapter';
import type { VideoEditRequest } from '../../video-edit/model';
import { VIDEO_EDIT } from '../../video-edit/tokens';
import { VideoEditRefused } from '../../video-edit/validate';
import { toSettings, VideoToolDialog } from './video-tool.dialog';

const tool = (id: string) => DEMO_TOOLS.find((t) => t.id === id)!;

function setup(id: string, create?: (r: VideoEditRequest) => ReturnType<InMemoryVideoEdit['create']>, lang: 'en' | 'es' = 'en', library: MotionLibraryPort = new InMemoryMotionLibrary({ pace: 0, previewUrl: () => 'blob:preview' })) {
  stubStorage({ 'video-studio.lang': lang });
  const port = new InMemoryVideoEdit({ pace: 0 });
  const requests: VideoEditRequest[] = [];
  port.create = (r) => (requests.push(r), create ? create(r) : InMemoryVideoEdit.prototype.create.call(port, r));
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [provideLabForms({ lang }), { provide: VIDEO_EDIT, useValue: port }, { provide: MOTION_LIBRARY, useValue: library }, { provide: MAT_DIALOG_DATA, useValue: tool(id) }, { provide: MatDialogRef, useValue: { close } }],
  });
  const fixture = TestBed.createComponent(VideoToolDialog);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const choose = async (file: File) => {
    const input = el.querySelector<HTMLInputElement>('[data-testid=video-file]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  const generate = async () => {
    el.querySelector<HTMLButtonElement>('[data-testid=generate-edit]')!.click();
    await settle();
  };
  return { fixture, el, requests, close, settle, choose, generate };
}
const video = (name = 'clip.mp4') => new File([new Uint8Array(8)], name, { type: 'video/mp4' });

describe('VideoToolDialog', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the tool, its notes and a form for its settings in the page language', async () => {
    const { el, settle } = setup('scale', undefined, 'es');
    await settle();
    expect(el.querySelector('h2')?.textContent).toBe('Escalar');
    expect(el.querySelectorAll('mat-select')).toHaveLength(2);
    expect(el.textContent).toContain('Cuántas veces más grande');
  });

  it('has no settings form for a tool that has no settings, and still asks for the video', async () => {
    const { el, settle } = setup('depth');
    await settle();
    expect(el.querySelector('h2')?.textContent).toBe('Depth');
    expect(el.querySelector('dynamic-form')).toBeNull();
    expect(el.querySelector('[data-testid=choose-video]')).not.toBeNull();
  });

  it('refuses a file that is not a video, and says so', async () => {
    const { el, choose, generate, requests } = setup('scale');
    await choose(new File(['x'], 'photo.png', { type: 'image/png' }));
    expect(el.querySelector('[data-testid=tool-error]')?.textContent).toContain('not a video');
    await generate();
    expect(requests).toEqual([]);
  });

  it('says a video is needed when Generate is pressed without one, and sends nothing', async () => {
    const { el, generate, requests } = setup('scale');
    await generate();
    expect(el.querySelector('[data-testid=tool-error]')?.textContent).toContain('Choose the video');
    expect(requests).toEqual([]);
  });

  it('sends the video, the tool and the settings it started with, and closes with the edit', async () => {
    const { el, choose, generate, requests, close } = setup('scale');
    await choose(video());
    expect(el.querySelector('[data-testid=video-name]')?.textContent).toContain('clip.mp4');
    await generate();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ tool: 'scale', settings: { factor: 2, engine: 'fast' }, video: { name: 'clip.mp4' } });
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ tool: 'scale', state: 'queued' }));
  });

  it('shows the refusal and stays open so it can be corrected', async () => {
    const refuse = () => throwError(() => new VideoEditRefused([{ code: 'server', message: 'the video is not readable' }]));
    const { el, choose, generate, close } = setup('interpolate', refuse);
    await choose(video('bad.mkv'));
    await generate();
    expect(el.querySelector('[data-testid=tool-error]')?.textContent).toContain('the video is not readable');
    expect(close).not.toHaveBeenCalled();
    expect(el.querySelector<HTMLButtonElement>('[data-testid=generate-edit]')!.disabled).toBe(false);
  });

  it('keeps only the tool\'s own settings that have a value', () => {
    expect(toSettings(tool('extend'), { seconds: 6, prompt: '', engine: null, other: 1 })).toEqual({ seconds: 6 });
  });
});

describe('VideoToolDialog settings of the other tools', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reframe asks for the colour of the bars only when the bars are chosen, and sends what was written', async () => {
    const { el, settle, choose, generate, requests, fixture } = setup('reframe');
    await settle();
    const text = () => el.textContent ?? '';
    expect(text()).not.toContain('Bar colour');
    const model = (fixture.componentInstance as unknown as { model: { set(v: unknown): void } }).model;
    model.set({ aspect_ratio: '9:16', mode: 'pad', color: '#112233' });
    await settle();
    expect(text()).toContain('Bar colour');
    await choose(video());
    await generate();
    expect(requests[0].settings).toEqual({ aspect_ratio: '9:16', mode: 'pad', color: '#112233' });
  });

  it('remove-background hides the colour when the background is transparent and sends alpha', async () => {
    const { el, settle, choose, generate, requests, fixture } = setup('remove-background');
    await settle();
    expect(el.textContent).toContain('Background colour');
    const model = (fixture.componentInstance as unknown as { model: { set(v: unknown): void } }).model;
    model.set({ alpha: true });
    await settle();
    expect(el.textContent).not.toContain('Background colour');
    await choose(video());
    await generate();
    expect(requests[0].settings).toEqual({ alpha: true });
  });

  it('extend sends the seconds and the prompt, and a refusal out of limits stays in the dialog', async () => {
    const { el, settle, choose, generate, requests, close, fixture } = setup('extend');
    await settle();
    const model = (fixture.componentInstance as unknown as { model: { set(v: unknown): void } }).model;
    model.set({ seconds: 12, prompt: 'the fox leaves', engine: 'ltx' });
    await choose(video());
    await generate();
    // the port saw the request and refused it: the dialog shows why and stays open
    expect(el.querySelector('[data-testid=tool-error]')?.textContent).toContain('2 to 10');
    expect(close).not.toHaveBeenCalled();
    model.set({ seconds: 6, prompt: 'the fox leaves', engine: 'ltx' });
    await generate();
    expect(requests.at(-1)!.settings).toEqual({ seconds: 6, prompt: 'the fox leaves', engine: 'ltx' });
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('VideoToolDialog for Motion Control', () => {
  afterEach(() => vi.unstubAllGlobals());

  const image = () => new File([new Uint8Array(8)], 'person.png', { type: 'image/png' });
  const pickFile = async (el: HTMLElement, settle: () => Promise<void>, testid: string, file: File) => {
    await settle();
    const input = el.querySelector<HTMLInputElement>(`[data-testid=${testid}]`)!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  /** A library that already holds a motion (ready, 6 seconds) when the dialog opens. */
  const seeded = async (pace = 0): Promise<InMemoryMotionLibrary> => {
    const library = new InMemoryMotionLibrary({ pace, previewUrl: () => 'blob:preview' });
    await firstValueFrom(library.add({ video: { name: 'walk.mp4', blob: new Blob(['x']) }, title: 'Walk' }));
    if (pace === 0) await new Promise((r) => setTimeout(r, 5));
    return library;
  };
  /** A library that lists one ready motion of the given length. */
  const lasting = (duration: number): MotionLibraryPort => {
    const motion: Motion = { id: 'm1', title: 'Long', tags: [], duration, people: 1, state: 'ready', preview: 'blob:p' };
    return { list: () => of([motion]), add: () => throwError(() => new Error('unused')), remove: () => of(undefined) };
  };
  const useFirst = async (el: HTMLElement, settle: () => Promise<void>) => {
    await settle();
    el.querySelector<HTMLButtonElement>('[data-testid^=use-]')!.click();
    await settle();
  };
  const moveStart = async (el: HTMLElement, settle: () => Promise<void>, value: number) => {
    const range = el.querySelector<HTMLInputElement>('[data-testid=start-range]')!;
    range.value = String(value);
    range.dispatchEvent(new Event('input'));
    await settle();
  };

  it('asks for the reference image too, and says it is missing without sending anything', async () => {
    const { el, settle, choose, generate, requests } = setup('motion-control');
    await settle();
    expect(el.querySelector('[data-testid=choose-image]')).not.toBeNull();
    await choose(video());
    await generate();
    expect(el.querySelector('[data-testid=tool-error]')?.textContent).toContain('Choose the reference image');
    expect(requests).toEqual([]);
  });

  it('refuses a file that is not an image', async () => {
    const { el, settle } = setup('motion-control');
    await pickFile(el, settle, 'image-file', new File(['x'], 'a.mp4', { type: 'video/mp4' }));
    expect(el.querySelector('[data-testid=tool-error]')?.textContent).toContain('not an image');
  });

  it('says the library is empty and points to it, and the other tools show no library at all', async () => {
    const { el, settle } = setup('motion-control');
    await settle();
    expect(el.querySelector('[data-testid=motions-empty]')?.textContent).toContain('library is empty');
    expect(el.querySelector('[data-testid=open-library]')).not.toBeNull();
    TestBed.resetTestingModule();
    const other = setup('scale');
    await other.settle();
    expect(other.el.querySelector('.motions')).toBeNull();
  });

  it('does not add or remove motions itself: that is the library\'s', async () => {
    const { el, settle } = setup('motion-control', undefined, 'en', await seeded());
    await settle();
    expect(el.querySelector('[data-testid=add-motion]')).toBeNull();
    expect(el.querySelector('[data-testid^=remove-]')).toBeNull();
    expect(el.querySelector('[data-testid^=use-]')).not.toBeNull();
  });

  it('opens the Motion library', async () => {
    const { el, settle } = setup('motion-control');
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue(undefined as never);
    await settle();
    el.querySelector<HTMLButtonElement>('[data-testid=open-library]')!.click();
    expect(open).toHaveBeenCalledWith(MotionLibraryDialog, expect.anything());
  });

  it('sends the image and the chosen motion, and no video, with the start chosen on its preview', async () => {
    const { el, settle, generate, requests, close } = setup('motion-control', undefined, 'en', await seeded());
    await settle();
    expect(el.querySelector('[data-testid=motion-start]')).toBeNull();
    await pickFile(el, settle, 'image-file', image());
    await useFirst(el, settle);
    expect(el.querySelector('[data-testid=motion-start]')).not.toBeNull();
    await moveStart(el, settle, 2);
    expect(el.querySelector('[data-testid=start-takes]')?.textContent).toContain('Seconds 2 to 4');
    await generate();
    expect(requests).toHaveLength(1);
    expect(requests[0].video).toBeUndefined();
    expect(requests[0]).toMatchObject({ tool: 'motion-control', motion: 'mem-motion-1', image: { name: 'person.png' }, settings: { start: 2 } });
    expect(close).toHaveBeenCalled();
  });

  it('lets a 10 second motion start at 4 seconds, and a 2.5 second one only up to 0.5', async () => {
    const long = setup('motion-control', undefined, 'en', lasting(10));
    await useFirst(long.el, long.settle);
    await moveStart(long.el, long.settle, 4);
    expect(long.el.querySelector('[data-testid=start-takes]')?.textContent).toContain('Seconds 4 to 6');
    TestBed.resetTestingModule();
    const short = setup('motion-control', undefined, 'en', lasting(2.5));
    await useFirst(short.el, short.settle);
    expect(short.el.querySelector<HTMLInputElement>('[data-testid=start-range]')!.max).toBe('0.5');
  });

  it('uses a video or a motion, never both: choosing one replaces the other', async () => {
    const { el, settle, choose } = setup('motion-control', undefined, 'en', await seeded());
    await useFirst(el, settle);
    expect(el.querySelector('li.chosen')).not.toBeNull();
    await choose(video('mine.mp4'));
    expect(el.querySelector('[data-testid=video-name]')?.textContent).toContain('mine.mp4');
    el.querySelector<HTMLButtonElement>('[data-testid^=use-]')!.click();
    await settle();
    expect(el.querySelector('[data-testid=video-name]')).toBeNull();
  });

  it('sends no start when a video is used', async () => {
    const { el, settle, choose, generate, requests } = setup('motion-control', undefined, 'en', await seeded());
    await settle();
    await pickFile(el, settle, 'image-file', image());
    await choose(video());
    await generate();
    expect(requests).toHaveLength(1);
    expect(requests[0].settings).not.toHaveProperty('start');
  });

  it('shows a motion being prepared, and cannot use it until it is ready', async () => {
    const { el, settle } = setup('motion-control', undefined, 'en', await seeded(100000));
    await settle();
    expect(el.textContent).toContain('Preparing');
    expect(el.querySelector('[data-testid^=use-]')).toBeNull();
  });

  it('says the library could not be read', async () => {
    const broken: MotionLibraryPort = { list: () => throwError(() => new Error('down')), add: () => throwError(() => new Error('unused')), remove: () => of(undefined) };
    const { el, settle } = setup('motion-control', undefined, 'en', broken);
    await settle();
    expect(el.querySelector('[data-testid=motions-error]')?.textContent).toContain('could not be read');
  });
});
