import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { NEVER, of, throwError } from 'rxjs';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../../testing/memory-storage';
import { RETOUCHED, retouchAndUse, stubImageEdit } from '../../testing/retouch';
import { EDIT_TOOLS, type EditTool } from '../edit-tools/registry';
import { InMemoryMotionLibrary } from '../motions/in-memory.adapter';
import { MOTION_LIBRARY } from '../motions/tokens';
import { Notifier } from '../shared/notifier';
import { InMemoryVideoGeneration } from '../video/in-memory.adapter';
import { VIDEO_GENERATION } from '../video/tokens';
import { IMAGE_EDIT } from '../retouch/tokens';
import { StudioPage } from './studio.page';
import { InMemoryVideoEdit } from '../video-edit/in-memory.adapter';
import type { VideoEditPort } from '../video-edit/port';
import { VIDEO_EDIT } from '../video-edit/tokens';

async function setup(lang: 'es' | 'en' = 'en', videoEdit: VideoEditPort = new InMemoryVideoEdit()) {
  stubStorage({ 'video-studio.lang': lang });
  TestBed.configureTestingModule({
    providers: [
      provideLabForms({ lang }),
      { provide: VIDEO_GENERATION, useValue: new InMemoryVideoGeneration() },
      { provide: VIDEO_EDIT, useValue: videoEdit },
      { provide: MOTION_LIBRARY, useValue: new InMemoryMotionLibrary({ pace: 0 }) },
      { provide: IMAGE_EDIT, useValue: stubImageEdit() },
      { provide: Notifier, useValue: { request: vi.fn(async () => undefined), show: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(StudioPage);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const tab = (name: string) => Array.from(el.querySelectorAll<HTMLButtonElement>('[role=tab]')).find((b) => b.textContent?.trim() === name)!;
  const click = async (target: HTMLElement) => {
    target.click();
    await settle();
  };
  return { fixture, el, settle, tab, click };
}

describe('the tabs of the side panel', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
    vi.unstubAllGlobals();
  });

  it('opens on Create video, with Edit video one click away', async () => {
    const { el, tab } = await setup();
    expect(tab('Create video').getAttribute('aria-selected')).toBe('true');
    expect(tab('Edit video').getAttribute('aria-selected')).toBe('false');
    expect(el.querySelector<HTMLElement>('#panel-create')!.hidden).toBe(false);
    expect(el.querySelector<HTMLElement>('#panel-edit')!.hidden).toBe(true);
  });

  it('keeps what was typed in the Create tab while the Edit tab is open', async () => {
    const { el, tab, click, settle } = await setup();
    const box = el.querySelector<HTMLTextAreaElement>('textarea')!;
    box.value = 'a fox';
    box.dispatchEvent(new Event('input'));
    await settle();
    await click(tab('Edit video'));
    expect(el.querySelector<HTMLElement>('#panel-create')!.hidden).toBe(true);
    await click(tab('Create video'));
    expect(el.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('a fox');
  });

  it('names the tabs in Spanish in a Spanish browser', async () => {
    const { tab } = await setup('es');
    expect(tab('Crear vídeo')).toBeTruthy();
    expect(tab('Editar vídeo')).toBeTruthy();
  });
});

const VIDEO_TOOL_NAMES = ['Scale', 'More frames per second', 'Reframe', 'Remove background', 'Depth', 'Extend', 'Motion Control'];

describe('the Edit tab', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
    vi.unstubAllGlobals();
  });

  const names = (el: HTMLElement) => Array.from(el.querySelectorAll('app-edit-tools .tool:not([data-testid=tool-motion-library]) .name')).map((n) => n.textContent?.trim());
  /** The in-memory port with its tools read another way. */
  const withTools = (tools: VideoEditPort['tools']): VideoEditPort => Object.assign(new InMemoryVideoEdit(), { tools });

  it('lists only Retouch image when the server lists no video tools', async () => {
    const { el } = await setup('en', withTools(() => of([])));
    expect(EDIT_TOOLS.map((t) => t.id)).toEqual(['retouch']);
    expect(names(el)).toEqual(['Retouch image']);
    expect(el.querySelectorAll('app-edit-tools button[disabled]')).toHaveLength(0);
  });

  it('lists Retouch image and the seven tools of the server, in its order, in the page language', async () => {
    const en = await setup('en');
    expect(names(en.el)).toEqual(['Retouch image', 'Scale', 'More frames per second', 'Reframe', 'Remove background', 'Depth', 'Extend', 'Motion Control']);
    TestBed.resetTestingModule();
    const es = await setup('es');
    expect(names(es.el)).toEqual(['Retocar imagen', 'Escalar', 'Más fotogramas por segundo', 'Reencuadrar', 'Quitar el fondo', 'Profundidad', 'Alargar', 'Motion Control']);
  });

  it('offers the Motion library under the tools, even when the server lists none, and opens it', async () => {
    const { el, click } = await setup('es', withTools(() => of([])));
    const row = el.querySelector<HTMLButtonElement>('app-edit-tools [data-testid=tool-motion-library]')!;
    expect(row.querySelector('.name')?.textContent?.trim()).toBe('Biblioteca de movimientos');
    expect(row.disabled).toBe(false);
    await click(row);
    expect(document.querySelector('app-motion-library-dialog')).not.toBeNull();
  });

  it('shows an unavailable tool disabled, with the server\'s reason', async () => {
    const { el } = await setup();
    const depth = el.querySelector<HTMLButtonElement>('[data-testid=tool-depth]')!;
    expect(depth.disabled).toBe(true);
    expect(depth.querySelector('.hint')?.textContent).toContain('needs a server');
    expect(el.querySelector<HTMLButtonElement>('[data-testid=tool-scale]')!.disabled).toBe(false);
  });

  it('says the video tools are being read, and keeps Retouch image usable', async () => {
    const { el } = await setup('en', withTools(() => NEVER));
    expect(el.querySelector('[data-testid=tools-loading]')).not.toBeNull();
    expect(names(el)).toEqual(['Retouch image']);
  });

  it('says the tools could not be read, with a retry that asks again', async () => {
    let calls = 0;
    const port = withTools(() => (++calls === 1 ? throwError(() => new Error('down')) : new InMemoryVideoEdit().tools()));
    const { el, click } = await setup('en', port);
    expect(el.querySelector('[data-testid=tools-error]')?.textContent).toContain('could not be read');
    expect(names(el)).toEqual(['Retouch image']);
    await click(el.querySelector<HTMLButtonElement>('[data-testid=tools-retry]')!);
    expect(el.querySelector('[data-testid=tools-error]')).toBeNull();
    expect(names(el)).toHaveLength(8);
  });

  it('lists a tool added to the registry without any other change', async () => {
    const ran = vi.fn();
    (EDIT_TOOLS as EditTool[]).push({ id: 'extra', icon: 'M0 0', name: () => 'Extra', hint: () => 'for a test', run: ran });
    try {
      const { el, click } = await setup();
      const names = Array.from(el.querySelectorAll('app-edit-tools .tool:not([data-testid=tool-motion-library]) .name')).map((n) => n.textContent?.trim());
      expect(names).toEqual(['Retouch image', 'Extra', ...VIDEO_TOOL_NAMES]);
      await click(el.querySelector<HTMLButtonElement>('[data-testid=tool-extra]')!);
      expect(ran).toHaveBeenCalledOnce();
    } finally {
      (EDIT_TOOLS as EditTool[]).pop();
    }
  });

  it('edits a video chosen in a tool: the dialog closes and the edit shows in the history until it is done', async () => {
    const { el, settle, click } = await setup('en', new InMemoryVideoEdit({ pace: 5, steps: 2, videoUrl: () => 'blob:result' }));
    await click(el.querySelector<HTMLButtonElement>('[data-testid=tool-scale]')!);
    const dialog = document.querySelector('app-video-tool-dialog') as HTMLElement;
    expect(dialog).not.toBeNull();
    const input = dialog.querySelector<HTMLInputElement>('[data-testid=video-file]')!;
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(8)], 'clip.mp4', { type: 'video/mp4' })], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
    dialog.querySelector<HTMLButtonElement>('[data-testid=generate-edit]')!.click();
    await settle();
    await vi.waitFor(async () => {
      await settle();
      expect(document.querySelector('app-video-tool-dialog')).toBeNull();
    });
    expect(el.querySelector('app-history app-edit-card .name')?.textContent).toBe('Scale');
    await vi.waitFor(async () => {
      await settle();
      expect(el.querySelector('app-history app-edit-card .state')?.textContent).toBe('Done');
    });
    expect(el.querySelector('app-history app-edit-card [data-testid=sound]')?.textContent).toBe('With sound');
  });

  const choose = async (el: HTMLElement, settle: () => Promise<void>, file: File) => {
    const input = el.querySelector<HTMLInputElement>('[data-testid=tool-file]')!;
    vi.spyOn(input, 'click').mockImplementation(() => undefined);
    el.querySelector<HTMLButtonElement>('[data-testid=tool-retouch]')!.click();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
  };

  it('retouches an image chosen there and makes the variant used the start image of the Create tab', async () => {
    const { el, settle, tab, click } = await setup();
    await click(tab('Edit video'));
    await choose(el, settle, new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }));
    await vi.waitFor(async () => {
      await settle();
      expect(document.querySelector('app-retouch-dialog')).not.toBeNull();
    });
    await retouchAndUse(settle, 'as a watercolor', 1);
    await vi.waitFor(async () => {
      await settle();
      expect(el.querySelector<HTMLElement>('#panel-create')!.hidden).toBe(false);
    });
    expect(el.querySelector<HTMLImageElement>('app-create-panel .preview img')?.src).toBe(RETOUCHED[1].dataUrl);
  });

  it('refuses a file that is not an image and does not open the retouch', async () => {
    const { el, settle, tab, click } = await setup();
    await click(tab('Edit video'));
    await choose(el, settle, new File([new Uint8Array(10)], 'a.txt', { type: 'text/plain' }));
    expect(el.querySelector('app-edit-tools .error')?.textContent).toContain('That file is not an image.');
    expect(document.querySelector('app-retouch-dialog')).toBeNull();
  });

  it('names the tool in Spanish in a Spanish browser', async () => {
    const { el } = await setup('es');
    expect(el.querySelector('app-edit-tools .tool:not([data-testid=tool-motion-library]) .name')?.textContent?.trim()).toBe('Retocar imagen');
  });
});
