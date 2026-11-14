import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { MOTION_EDIT_BASE, MOTION_EDIT_OPTIONS } from '../../core/options';
import { FlowStorage } from '../flow.storage';
import { FlowStore } from '../flow.store';
import { settle, testPlan } from '../flow.testing';
import { FlowList } from './flow-list';

async function create(options: { flows?: number; lang?: 'es' | 'en' } = {}) {
  const data: Record<string, string> = {};
  const storage = new FlowStorage('motion-edit', { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) });
  let t = 1000;
  let n = 0;
  const store = new FlowStore(storage, { now: () => (t += 10), newId: () => `flow-${++n}` });
  for (let i = 0; i < (options.flows ?? 0); i++) store.start(`prompt ${i}`, testPlan());
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: MOTION_EDIT_OPTIONS, useValue: { lang: options.lang ?? 'en' } }, { provide: MOTION_EDIT_BASE, useValue: '/motion-edit' }, { provide: FlowStore, useValue: store }, { provide: FlowStorage, useValue: storage }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(FlowList);
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, el, get, store, storage, navigate, data };
}

describe('FlowList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says there are no flows, and lists the kept ones newest first with where each is', async () => {
    const empty = await create();
    expect(empty.get('no-flows')).not.toBeNull();
    TestBed.resetTestingModule();
    const { el, get } = await create({ flows: 2 });
    expect(get('no-flows')).toBeNull();
    const rows = [...el.querySelectorAll('li')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Night Drive');
    expect(rows[0].textContent).toContain('at "Song"');
  });

  it('resumes a flow through a link under the section', async () => {
    const { el } = await create({ flows: 1 });
    expect(el.querySelector('[data-testid="resume"]')!.getAttribute('href')).toMatch(/^\/motion-edit\/flow\/flow-1$/);
  });

  it('deletes a flow after asking, and keeps it when the answer is no', async () => {
    const { el, fixture, store } = await create({ flows: 1 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    (el.querySelector('[data-testid="delete"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(store.flows()).toHaveLength(1);
    (el.querySelector('[data-testid="delete"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(store.flows()).toHaveLength(0);
    expect(confirm.mock.calls[0][0]).toContain('prompt 0');
  });

  it('exports a flow as a JSON file', async () => {
    const created: Blob[] = [];
    Object.assign(URL, { createObjectURL: (b: Blob) => (created.push(b), 'blob:x'), revokeObjectURL: () => undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { el } = await create({ flows: 1 });
    (el.querySelector('[data-testid="export"]') as HTMLButtonElement).click();
    expect(click).toHaveBeenCalled();
    expect(JSON.parse(await created[0].text())).toMatchObject({ id: 'flow-1', prompt: 'prompt 0' });
  });

  it('imports a flow from a file, opens it, and gives it a new id when one with that id is kept', async () => {
    const { el, fixture, store, storage, navigate } = await create({ flows: 1 });
    const text = storage.export(store.flows()[0]);
    const input = el.querySelector('[data-testid="import"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([text], 'f.json', { type: 'application/json' })], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    await settle(fixture);
    expect(store.flows()).toHaveLength(2);
    expect(navigate.mock.calls[0][0]).not.toEqual(['/motion-edit/flow', 'flow-1']);
  });

  it('refuses a file that is not a flow', async () => {
    const { el, fixture, get, navigate } = await create();
    const input = el.querySelector('[data-testid="import"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['{"nope":1}'], 'f.json')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(async () => {
      await settle(fixture);
      expect(get('import-error')).not.toBeNull();
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the default switches for the steps that may run on, and offers none for the others', async () => {
    const { el, get, store, data } = await create();
    expect(el.querySelectorAll('[data-testid^="default-"]')).toHaveLength(3);
    expect(get('default-song')).toBeNull();
    expect(get('default-render')).toBeNull();
    (get('default-design') as HTMLInputElement).click();
    expect(store.defaults()).toEqual({ design: true });
    expect(JSON.parse(data['motion-edit.flow-defaults'])).toEqual({ design: true });
  });

  it('speaks Spanish when the host does', async () => {
    const { get } = await create({ lang: 'es' });
    expect(get('defaults')!.textContent).toContain('No parar en estos pasos');
  });
});
