import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';
import { firstValueFrom, of, throwError } from 'rxjs';

import { stubStorage } from '../../testing/memory-storage';
import { InMemoryMotionLibrary } from '../motions/in-memory.adapter';
import type { Motion, MotionRequest } from '../motions/model';
import type { MotionLibraryPort } from '../motions/port';
import { MOTION_LIBRARY } from '../motions/tokens';
import { MotionLibraryDialog } from './motion-library.dialog';

const motion = (id: string, state: Motion['state'], extra: Partial<Motion> = {}): Motion => ({ id, title: `Motion ${id}`, tags: ['walk'], duration: 6, people: 1, state, preview: 'blob:p', ...extra });
const file = (name = 'walk.mp4') => new File([new Uint8Array(8)], name, { type: 'video/mp4' });

function setup(library: MotionLibraryPort, lang: 'en' | 'es' = 'en', confirm: boolean | null = true) {
  stubStorage({ 'video-studio.lang': lang });
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang }), { provide: MOTION_LIBRARY, useValue: library }, { provide: MatDialogRef, useValue: { close: vi.fn() } }] });
  const asked = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({ afterClosed: () => of(confirm) } as never);
  const fixture = TestBed.createComponent(MotionLibraryDialog);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = async (key: string, value: string) => {
    const model = (fixture.componentInstance as unknown as { model: { update(f: (m: Record<string, unknown>) => Record<string, unknown>): void } }).model;
    model.update((m) => ({ ...m, [key]: value }));
    await settle();
  };
  const choose = async (f: File) => {
    const input = el.querySelector<HTMLInputElement>('[data-testid=motion-file]')!;
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  const add = async () => {
    el.querySelector<HTMLButtonElement>('[data-testid=add-motion]')!.click();
    await settle();
  };
  return { el, settle, type, choose, add, asked };
}

/** A port over a fixed list that records what it is asked to add and remove. */
function fake(list: readonly Motion[], add?: MotionLibraryPort['add']) {
  const added: MotionRequest[] = [];
  const removed: string[] = [];
  const port: MotionLibraryPort = {
    list: () => of(list),
    add: (r) => (added.push(r), add ? add(r) : of(motion('new', 'processing'))),
    remove: (id) => (removed.push(id), of(undefined)),
  };
  return { port, added, removed };
}

describe('MotionLibraryDialog', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists a ready, a processing and a failed motion with what each is', async () => {
    const { port } = fake([motion('a', 'ready', { duration: 6, people: 2 }), motion('b', 'processing'), motion('c', 'failed', { error: 'nobody appears in the video' })]);
    const { el, settle } = setup(port);
    await settle();
    expect(el.querySelector('[data-testid=motion-a] video')).not.toBeNull();
    expect(el.querySelector('[data-testid=motion-a]')?.textContent).toContain('6 s · 2 people');
    expect(el.querySelector('[data-testid=motion-b]')?.textContent).toContain('Preparing');
    expect(el.querySelector('[data-testid=motion-b] video')).toBeNull();
    expect(el.querySelector('[data-testid=motion-c]')?.textContent).toContain('nobody appears in the video');
  });

  it('says in Spanish that the library is empty, not that it failed', async () => {
    const { el, settle } = setup(fake([]).port, 'es');
    await settle();
    expect(el.querySelector('[data-testid=motions-empty]')?.textContent).toContain('La biblioteca está vacía');
    expect(el.querySelector('[data-testid=motions-error]')).toBeNull();
  });

  it('says the library could not be read, offers to retry, and does not show it empty', async () => {
    let calls = 0;
    const port: MotionLibraryPort = { list: () => (++calls === 1 ? throwError(() => new Error('down')) : of([motion('a', 'ready')])), add: () => of(motion('x', 'processing')), remove: () => of(undefined) };
    const { el, settle } = setup(port);
    await settle();
    expect(el.querySelector('[data-testid=motions-error]')?.textContent).toContain('could not be read');
    expect(el.querySelector('[data-testid=motions-empty]')).toBeNull();
    el.querySelector<HTMLButtonElement>('[data-testid=motions-retry]')!.click();
    await settle();
    expect(el.querySelector('[data-testid=motions-error]')).toBeNull();
    expect(el.querySelector('[data-testid=motion-a]')).not.toBeNull();
  });

  it('states the limits before anything is added', async () => {
    const { el, settle } = setup(fake([]).port);
    await settle();
    const limits = el.querySelector('[data-testid=motion-limits]')?.textContent ?? '';
    expect(limits).toContain('2.1 to 30 seconds');
    expect(limits).toContain('One person');
    expect(limits).toContain('vision service');
  });

  it('adds a video with its title and tags, and clears the form', async () => {
    const { port, added } = fake([]);
    const { el, settle, type, choose, add } = setup(port);
    await settle();
    await choose(file());
    await type('title', ' Slow walk ');
    await type('tags', 'walk, slow,,');
    await add();
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ title: 'Slow walk', tags: ['walk', 'slow'], video: { name: 'walk.mp4' } });
    expect(added[0].source).toBeUndefined();
    expect(el.querySelector('[data-testid=motion-file-name]')).toBeNull();
    expect(el.querySelector('[data-testid=motion-error]')).toBeNull();
  });

  it('adds an address as `source` and no file', async () => {
    const { port, added } = fake([]);
    const { settle, type, add } = setup(port);
    await settle();
    await type('source', 'https://example.com/dance.mp4');
    await add();
    expect(added).toEqual([{ source: 'https://example.com/dance.mp4' }]);
  });

  it('sends nothing when a file and an address are both given, or none is', async () => {
    const { port, added } = fake([]);
    const { el, settle, type, choose, add } = setup(port);
    await settle();
    await add();
    expect(el.querySelector('[data-testid=motion-error]')?.textContent).toContain('needed');
    await choose(file());
    await type('source', 'https://example.com/dance.mp4');
    await add();
    expect(el.querySelector('[data-testid=motion-error]')?.textContent).toContain('not both');
    expect(added).toEqual([]);
  });

  it('refuses a file that is not a video', async () => {
    const { el, settle, choose } = setup(fake([]).port);
    await settle();
    await choose(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(el.querySelector('[data-testid=motion-error]')?.textContent).toContain('not a video');
    expect(el.querySelector('[data-testid=motion-file-name]')).toBeNull();
  });

  it('shows the server\'s reason when a video is refused and leaves the list as it was', async () => {
    const { port } = fake([motion('a', 'ready')], () => throwError(() => new Error('nobody appears in the video')));
    const { el, settle, choose, add } = setup(port);
    await settle();
    await choose(file('empty.mp4'));
    await add();
    expect(el.querySelector('[data-testid=motion-error]')?.textContent).toContain('Could not add the motion: nobody appears in the video');
    expect(el.querySelectorAll('li[data-testid^=motion-]')).toHaveLength(1);
    expect(el.querySelector('[data-testid=add-motion]')?.textContent?.trim()).toBe('Add to the library');
  });

  it('shows a motion it adds as preparing, and ready once the library says so', async () => {
    const library = new InMemoryMotionLibrary({ pace: 5, previewUrl: () => 'blob:p' });
    const { el, settle, choose, add } = setup(library);
    await settle();
    await choose(file());
    await add();
    expect(el.textContent).toContain('Preparing');
    await vi.waitFor(async () => {
      await settle();
      expect(el.querySelector('li[data-state=ready] video')).not.toBeNull();
    });
    expect((await firstValueFrom(library.list()))[0].state).toBe('ready');
  });

  it('removes a motion only after confirming', async () => {
    const { port, removed } = fake([motion('a', 'ready')]);
    const yes = setup(port, 'en', true);
    await yes.settle();
    yes.el.querySelector<HTMLButtonElement>('[data-testid=remove-a]')!.click();
    expect(removed).toEqual(['a']);
    TestBed.resetTestingModule();
    const no = fake([motion('a', 'ready')]);
    const cancelled = setup(no.port, 'en', false);
    await cancelled.settle();
    cancelled.el.querySelector<HTMLButtonElement>('[data-testid=remove-a]')!.click();
    expect(no.removed).toEqual([]);
  });
});
