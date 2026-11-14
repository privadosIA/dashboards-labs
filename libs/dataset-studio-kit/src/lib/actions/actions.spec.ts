import { TestBed } from '@angular/core/testing';
import { ANIMATION } from '@lab/animation-core';
import { DATASET_PORT, DatasetFailed, InMemoryDataset } from '@lab/dataset-import';
import { provideLabForms } from '@lab/forms-kit';
import { of, throwError } from 'rxjs';

import { DATASET_STUDIO_OPTIONS } from '../core/options';
import { kindOf, type KindId } from '../kinds/kinds';
import type { PreviewStatus } from '../preview/status';
import { NO_STATUS } from '../preview/status';
import { DatasetActions, downloadName } from './actions';

const ok: PreviewStatus = { ...NO_STATUS, valid: true, entries: 2, imported: 2, yaml: 'scenes:\n' };
const raw = JSON.stringify([['s01', 'Canciones de verano', '', 'a'], ['s02', 'Two', '', 'b']]);

async function create(kind: KindId, status: PreviewStatus, options: { port?: unknown; raw?: string; lang?: 'es' | 'en' } = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: DATASET_STUDIO_OPTIONS, useValue: { lang: options.lang ?? 'en' } }, provideLabForms({ lang: options.lang ?? 'en' }), { provide: DATASET_PORT, useValue: options.port ?? new InMemoryDataset() }, { provide: ANIMATION, useValue: {} }],
  });
  const fixture = TestBed.createComponent(DatasetActions);
  fixture.componentRef.setInput('kind', kindOf(kind));
  fixture.componentRef.setInput('raw', options.raw ?? raw);
  fixture.componentRef.setInput('status', status);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, actions: fixture.componentInstance };
}
async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 2));
  }
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
type Internals = { form: { set: (v: Record<string, unknown>) => void } };

describe('DatasetActions', () => {
  it('names the project from the first title and creates it with the status\'s project file, then says which studio has it', async () => {
    const confirms: [string, string][] = [];
    const port = { preview: () => of(), confirm: (id: string, yaml: string) => (confirms.push([id, yaml]), of(id)) };
    const { fixture, el, actions } = await create('songs', ok, { port });
    expect((actions as unknown as Internals) && (actions as unknown as { form: () => Record<string, unknown> }).form()['id']).toBe('Canciones-de-verano');
    (actions as unknown as Internals).form.set({ id: 'canciones-verano' });
    await settle(fixture);
    (q(el, 'create') as HTMLButtonElement).click();
    await settle(fixture);
    expect(confirms).toEqual([['canciones-verano', 'scenes:\n']]);
    expect(q(el, 'created')!.textContent).toContain('2 entries were created in the project canciones-verano');
    expect(q(el, 'created')!.textContent).toContain('the Music studio');
  });

  it('shows the taken failure and nothing is created', async () => {
    const port = { preview: () => of(), confirm: () => throwError(() => new DatasetFailed('taken')) };
    const { fixture, el, actions } = await create('video', ok, { port });
    (actions as unknown as Internals).form.set({ id: 'busy-name' });
    await settle(fixture);
    (q(el, 'create') as HTMLButtonElement).click();
    await settle(fixture);
    expect(q(el, 'create-failed')!.textContent).toContain('There is already a project with that name');
    expect(q(el, 'created')).toBeNull();
  });

  it('keeps Create off while the server is reading, when nothing was understood, or when the name is empty', async () => {
    const busy = await create('video', { ...NO_STATUS, busy: true });
    expect((q(busy.el, 'create') as HTMLButtonElement).disabled).toBe(true);
    const none = await create('video', { ...ok, imported: 0 });
    expect((q(none.el, 'create') as HTMLButtonElement).disabled).toBe(true);
    expect(q(none.el, 'blocked')!.textContent).toContain('nothing to create');
    const unnamed = await create('video', ok, { raw: '[]' });
    expect((q(unnamed.el, 'create') as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuses a name the server would not take, in words, before anything is sent', async () => {
    const { fixture, el, actions } = await create('video', ok);
    (actions as unknown as Internals).form.set({ id: 'bad name!' });
    await settle(fixture);
    expect(q(el, 'bad-name')!.textContent).toContain('That name is not valid');
    expect((q(el, 'create') as HTMLButtonElement).disabled).toBe(true);
    (actions as unknown as Internals).form.set({ id: 'good-name' });
    await settle(fixture);
    expect(q(el, 'bad-name')).toBeNull();
    expect((q(el, 'create') as HTMLButtonElement).disabled).toBe(false);
  });

  it('forgets what it said about the last Create when the dataset changes, and says one entry in the singular', async () => {
    const one = { ...ok, entries: 1, imported: 1 };
    const { fixture, el, actions } = await create('songs', one, { raw: JSON.stringify([['t01', 'Song', '', 'a']]) });
    (actions as unknown as Internals).form.set({ id: 'one-song' });
    await settle(fixture);
    (q(el, 'create') as HTMLButtonElement).click();
    await settle(fixture);
    expect(q(el, 'created')!.textContent).toContain('1 entry was created in the project one-song');
    fixture.componentRef.setInput('raw', JSON.stringify([['t01', 'Song', '', 'a'], ['t02', 'Two', '', 'b']]));
    await settle(fixture);
    expect(q(el, 'created')).toBeNull();
  });

  it('says images run in images mode, only for images', async () => {
    expect(q((await create('images', ok)).el, 'images-mode')!.textContent).toContain('output.mode: images');
    expect(q((await create('video', ok)).el, 'images-mode')).toBeNull();
  });

  it('for the animated piece, explains that the song has to exist first when nothing can be made', async () => {
    const plan = { items: [{ kind: 'animation', index: 0, label: 'City', action: 'impossible', reason: 'song-missing' }], song: null, fitted: false } as never;
    const { el } = await create('piece', { ...ok, plan, dataset: {} as never }, { raw: '{}' });
    expect(q(el, 'blocked')!.textContent).toContain('song does not exist yet');
    expect((q(el, 'create') as HTMLButtonElement).disabled).toBe(true);
    expect(q(el, 'images-mode')).toBeNull();
  });

  it('asks the page to save the preset with the first title', async () => {
    const { fixture, el, actions } = await create('video', ok);
    const asked: string[] = [];
    actions.savePreset.subscribe((r) => asked.push(r.title));
    (q(el, 'save-preset') as HTMLButtonElement).click();
    await settle(fixture);
    expect(asked).toEqual(['Canciones de verano']);
  });

  it('names the downloaded file after the first title, safely', () => {
    expect(downloadName(kindOf('video'), raw)).toBe('Canciones-de-verano.json');
    expect(downloadName(kindOf('video'), '[]')).toBe('dataset.json');
    expect(downloadName(kindOf('piece'), JSON.stringify({ animation: { title: 'City waking' } }))).toBe('City-waking.json');
  });
});
