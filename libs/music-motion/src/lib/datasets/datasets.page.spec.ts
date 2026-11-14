import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { firstValueFrom, of } from 'rxjs';

import { InMemoryAnimation } from '../animation/in-memory.adapter';
import type { AnimationPort } from '@lab/animation-core';
import { ANIMATION } from '../animation/tokens';
import { MUSIC_MOTION_OPTIONS } from '../core/options';
import { stubStorage } from '../../testing/memory-storage';
import { DatasetsPage } from './datasets.page';

const settle = async (fixture: ComponentFixture<unknown>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

async function create(wrap: ((port: AnimationPort) => AnimationPort) | null = null, lang: 'es' | 'en' = 'en') {
  stubStorage();
  const memory = new InMemoryAnimation({ stepMs: 100, pollMs: 10 });
  await new Promise<void>((done) => memory.loadSample().subscribe(() => done()));
  const used = wrap ? wrap(memory) : memory;
  TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }, provideRouter([]), provideLabForms({ lang }), { provide: ANIMATION, useValue: used }] });
  /** What the browser was given to save: a Blob, a link to it with the file's name, and a click on the link. */
  const saved: { name: string; text: Promise<string> }[] = [];
  let blob: Blob | undefined;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => ((blob = b as Blob), 'blob:test'));
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, text: blob!.text() });
  });
  const fixture = TestBed.createComponent(DatasetsPage);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const rows = () => Array.from(el.querySelectorAll<HTMLElement>('[data-testid^="animation-"]'));
  const exportRow = async (row: HTMLElement) => {
    row.querySelector<HTMLButtonElement>('[data-testid="export-dataset"]')!.click();
    await settle(fixture);
    await new Promise((r) => setTimeout(r));
    await settle(fixture);
  };
  return { fixture, el, get, rows, exportRow, saved, port: memory };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DatasetsPage export', () => {
  it('lists the animations, newest first, each with its title, its song and an Export, and no list of checkboxes', async () => {
    const { rows, el, port } = await create();
    const pieces = await firstValueFrom(port.pieces());
    expect(pieces.length).toBeGreaterThan(0);
    expect(rows()).toHaveLength(Math.min(10, pieces.length));
    expect(rows()[0].textContent).toContain(pieces[0].title);
    expect(rows()[0].querySelector('[data-testid="song"]')!.textContent!.trim()).not.toBe('');
    expect(rows().every((r) => r.querySelector('[data-testid="export-dataset"]') !== null)).toBe(true);
    expect(el.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
  });

  it('says what the page is for in English and in Spanish', async () => {
    expect((await create(null, 'en')).el.textContent).toContain('A dataset is the dataset of one animation');
    TestBed.resetTestingModule();
    expect((await create(null, 'es')).el.textContent).toContain('Un dataset es el de una animación');
  });

  it('exports the animation of its row alone, and nothing of the server beyond it', async () => {
    const read: string[] = [];
    const { rows, exportRow, saved, port } = await create((memory) => {
      return new Proxy(memory, {
        get(target, key: string) {
          const value = (target as unknown as Record<string, unknown>)[key];
          return typeof value === 'function' ? (...args: unknown[]) => (read.push(key), (value as (...a: unknown[]) => unknown).apply(target, args)) : value;
        },
      }) as AnimationPort;
    });
    const pieces = await firstValueFrom(port.pieces());
    read.length = 0;
    await exportRow(rows()[1]);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toMatch(/\.motion\.json$/);
    const file = JSON.parse(await saved[0].text);
    expect(file.format).toBe('music-motion-dataset');
    expect(file.animation.title).toBe(pieces[1].title);
    expect(Object.keys(file).sort()).toEqual(['animation', 'exportedAt', 'format', 'version']);
    expect(read).not.toContain('references');
    expect(read).not.toContain('presets');
    expect(read).not.toContain('songs');
    expect(read.filter((k) => k === 'piece')).toHaveLength(1);
  });

  it('warns that an approved part goes without its text', async () => {
    expect((await create()).get('parts-note')!.textContent).toContain('cannot be read back');
  });

  it('says there are no animations when the server has none', async () => {
    const { get } = await create((memory) => Object.assign(Object.create(memory), { pieces: () => of([]) }) as AnimationPort);
    expect(get('empty')!.textContent).toContain('no animations to export');
  });

  it('shows the reason, in the server\'s words, when an animation cannot be read, and saves nothing', async () => {
    const { rows, exportRow, saved, el } = await create((memory) => Object.assign(Object.create(memory), { piece: () => { throw new Error('the server is gone'); } }) as AnimationPort);
    await exportRow(rows()[0]);
    expect(saved).toHaveLength(0);
    expect(el.querySelector('[data-testid="export-refused"]')!.textContent).toContain('Could not export the dataset:');
  });
});
