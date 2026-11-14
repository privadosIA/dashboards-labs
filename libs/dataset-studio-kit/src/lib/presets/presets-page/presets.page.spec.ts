import { TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { firstValueFrom } from 'rxjs';

import { DATASET_STUDIO_OPTIONS } from '../../core/options';
import { LocalPrompts } from '../adapters';
import type { Preset } from '../model';
import { MemoryPresetStore } from '../own-store';
import { PROMPTS } from '../port';
import { PresetsPage, ownBundle } from './presets.page';

async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  for (let i = 0; i < 4; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 4));
  }
}
async function create() {
  TestBed.resetTestingModule();
  const port = new LocalPrompts(new MemoryPresetStore());
  TestBed.configureTestingModule({ providers: [{ provide: DATASET_STUDIO_OPTIONS, useValue: { lang: 'en' } }, provideLabForms({ lang: 'en' }), { provide: PROMPTS, useValue: port }] });
  const fixture = TestBed.createComponent(PresetsPage);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, port };
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const pick = async (el: HTMLElement, text: string) => {
  const input = q(el, 'import-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [{ text: () => Promise.resolve(text) }], configurable: true });
  input.dispatchEvent(new Event('change'));
};
const item = (over: Record<string, unknown> = {}) => ({ kind: 'image', title: 'T', prompt: 'a prompt', tags: ['x'], source: 'hf/x', source_id: '1', licence: 'cc0-1.0', language: 'en', ...over });

describe('PresetsPage', () => {
  it('shows the library of every kind without Insert', async () => {
    const { el } = await create();
    expect(el.querySelectorAll('li.card').length).toBe(25);
    expect(el.querySelector('[data-testid^="insert-"]')).toBeNull();
  });

  it('imports a bundle and says how many were added, already there and refused, by index', async () => {
    const { fixture, el } = await create();
    await pick(el, JSON.stringify({ format: 'prompt-presets', version: 1, items: [item(), item({ source_id: '2', licence: '' })] }));
    await settle(fixture);
    expect(q(el, 'import-report')!.textContent).toContain('1 new, 0 were already there, 1 refused');
    expect(q(el, 'import-refused')!.textContent).toContain('Entry 2: it has no licence');
    expect(el.querySelectorAll('li.card').length).toBe(26);
    await pick(el, JSON.stringify({ format: 'prompt-presets', version: 1, items: [item()] }));
    await settle(fixture);
    expect(q(el, 'import-report')!.textContent).toContain('0 new, 1 were already there');
  });

  it('says a file that is not JSON is not a bundle', async () => {
    const { fixture, el } = await create();
    await pick(el, '{ nope');
    await settle(fixture);
    expect(q(el, 'import-problem')!.textContent).toContain('not a bundle of presets');
  });

  it('exports only the person\'s own presets, and says when there are none', async () => {
    const { fixture, el, port } = await create();
    (q(el, 'export-own') as HTMLButtonElement).click();
    await settle(fixture);
    expect(q(el, 'export-note')!.textContent).toContain('no presets of your own');
    await firstValueFrom(port.add({ kind: 'music', title: 'Mine', prompt: 'a song', tags: [], language: 'en', source: 'user', licence: 'own' }));
    const all = await firstValueFrom(port.list({ limit: 1000 }));
    const bundle = ownBundle(all.items);
    expect(bundle).toMatchObject({ format: 'prompt-presets', version: 1 });
    expect(bundle.items).toEqual([{ kind: 'music', title: 'Mine', prompt: 'a song', tags: [], language: 'en', source: 'user', licence: 'own' }]);
  });

  it('ownBundle leaves out bundled and imported presets', () => {
    const base = { kind: 'image', title: 't', prompt: 'p', tags: [], language: 'en', source: 's', licence: 'l', created_at: '' } as const;
    const list: Preset[] = [{ ...base, id: 'a', own: false }, { ...base, id: 'b', own: true }];
    expect(ownBundle(list).items.length).toBe(1);
  });
});
