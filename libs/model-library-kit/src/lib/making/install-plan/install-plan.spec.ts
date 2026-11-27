import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { MODEL_LIBRARY_OPTIONS } from '../../core/options';
import { InMemoryModelLibrary, type ServiceKind } from '../../memory.adapter';
import { LibraryFailed, MODEL_LIBRARY_PORT, type InstallPlan, type ModelLibraryPort } from '../../port';
import { MakingStore } from '../making.store';
import { InstallPlanDialog } from './install-plan';

const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const button = (id: string) => q(id) as HTMLButtonElement;
const box = (id: string) => q(id)!.querySelector('input') as HTMLInputElement;

async function settle(ms = 5): Promise<void> {
  await new Promise((done) => setTimeout(done, ms));
  TestBed.tick();
  await new Promise((done) => setTimeout(done, 0));
  TestBed.tick();
}

/** Opens the plan dialog of `engine` on a library in memory (or on the port given), with the lab's own store. */
async function open(engine: string, options: { library?: InMemoryModelLibrary; port?: ModelLibraryPort; service?: ServiceKind; sf3dKey?: boolean; lang?: 'es' | 'en' } = {}) {
  const library = options.library ?? new InMemoryModelLibrary({ service: options.service ?? 'default', sf3dKey: options.sf3dKey ?? true });
  const lang = options.lang ?? 'en';
  TestBed.configureTestingModule({ providers: [MakingStore, { provide: MODEL_LIBRARY_PORT, useValue: options.port ?? library }, { provide: MODEL_LIBRARY_OPTIONS, useValue: { lang, pollMs: 3 } }] });
  const store = TestBed.inject(MakingStore);
  const ref = TestBed.inject(MatDialog).open(InstallPlanDialog, { data: { store, engine, label: engine } });
  await settle(10);
  return { library, store, ref };
}

/** A port that answers the plan it is given and records what it is asked to start. */
function planned(plan: InstallPlan, start: ModelLibraryPort['startInstall'] = () => throwError(() => new Error('not started'))): { port: ModelLibraryPort; started: unknown[] } {
  const started: unknown[] = [];
  const port = { installPlan: () => of(plan), startInstall: (engine: string, options: unknown) => (started.push([engine, options]), start(engine, options as never)) } as unknown as ModelLibraryPort;
  return { port, started };
}

const SF3D: InstallPlan = {
  engine: 'sf3d',
  backend: 'dotnet',
  parts: ['weights'],
  missing: ['sf3d/model.safetensors'],
  bytes: 3_900_000_000,
  licence: 'Stability AI Community License',
  licenceTerms: { id: 'stability-community', name: 'Stability AI Community License', url: 'https://huggingface.co/stabilityai/stable-fast-3d', summary: 'Free under a revenue limit.', commercial: 'conditions' },
  gated: true,
  path: 'models/model3d/sf3d',
  free_bytes: 214_000_000_000,
};

describe('InstallPlanDialog: a licence that needs the person\'s acceptance', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    TestBed.resetTestingModule();
  });

  it('shows the licence above the confirm button, with an unticked box, and the confirmation is not offered until it is ticked', async () => {
    await open('sf3d');
    expect(q('plan-licence-terms')?.textContent).toContain('Stability AI Community License');
    expect(q('plan-licence-commercial')?.textContent).toContain('conditions');
    expect(q('plan-licence-summary')?.textContent).toContain('yearly revenue limit');
    expect(q('plan-licence-link')?.getAttribute('href')).toBe('https://huggingface.co/stabilityai/stable-fast-3d');
    expect(q('plan-licence-link')?.getAttribute('target')).toBe('_blank');
    expect(q('plan-licence-link')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(box('plan-licence-agree').checked).toBe(false);
    expect(button('plan-confirm').disabled).toBe(true);
    expect(q('plan-licence-needed')).not.toBeNull();
  });

  it('sends accept_licence with the confirmation only after the tick, and the tick can be taken back', async () => {
    const { library } = await open('sf3d');
    box('plan-licence-agree').click();
    await settle();
    expect(button('plan-confirm').disabled).toBe(false);
    expect(q('plan-licence-needed')).toBeNull();
    box('plan-licence-agree').click();
    await settle();
    expect(button('plan-confirm').disabled).toBe(true);
    box('plan-licence-agree').click();
    await settle();
    expect(library.calls.some((c) => c.startsWith('install'))).toBe(false);
    button('plan-confirm').click();
    await settle();
    expect(library.calls).toContain('install sf3d dotnet weights accept:stability-community');
  });

  it('says an acceptance was recorded on the server and still asks for the tick', async () => {
    const { port, started } = planned({ ...SF3D, licenceTerms: { ...SF3D.licenceTerms!, accepted: true } });
    await open('sf3d', { port });
    expect(q('plan-licence-recorded')?.textContent).toContain('already recorded');
    expect(box('plan-licence-agree').checked).toBe(false);
    expect(button('plan-confirm').disabled).toBe(true);
    expect(started).toEqual([]);
  });

  it('shows no box for a licence with no id and sends no accept_licence', async () => {
    const { library } = await open('triposr', { service: 'bare' });
    expect(q('plan-licence-terms')).toBeNull();
    expect(q('plan-licence')?.textContent).toContain('MIT');
    expect(button('plan-confirm').disabled).toBe(false);
    button('plan-confirm').click();
    await settle();
    expect(library.calls.find((c) => c.startsWith('install triposr'))).not.toContain('accept:');
  });

  it('asks nothing for a server that sends the licence as text', async () => {
    const { licenceTerms: _terms, ...older } = SF3D;
    const { port } = planned(older);
    await open('sf3d', { port });
    expect(q('plan-licence-terms')).toBeNull();
    expect(button('plan-confirm').disabled).toBe(false);
  });

  it('links the text of the licence only when it is a web address', async () => {
    const { port } = planned({ ...SF3D, licenceTerms: { ...SF3D.licenceTerms!, url: 'javascript:alert(1)' } });
    await open('sf3d', { port });
    expect(q('plan-licence-terms')).not.toBeNull();
    expect(q('plan-licence-link')).toBeNull();
  });

  it('shows the server\'s words when it asks for an acceptance the plan did not announce, and the dialog stays open', async () => {
    const { licenceTerms: _terms, ...older } = SF3D;
    const { port } = planned(older, () => throwError(() => new LibraryFailed(400, 'the licence stability-community has to be accepted: https://huggingface.co/stabilityai/stable-fast-3d', 'licence_acceptance_required')));
    const { ref } = await open('sf3d', { port });
    let closed = false;
    ref.afterClosed().subscribe(() => (closed = true));
    button('plan-confirm').click();
    await settle();
    expect(q('plan-problem')?.textContent).toContain('has to be accepted');
    expect(closed).toBe(false);
  });

  it('puts the licence in Spanish', async () => {
    await open('sf3d', { lang: 'es' });
    expect(q('plan-licence-commercial')?.textContent).toContain('condiciones');
    expect(q('plan-licence-agree')?.textContent).toContain('He leído la licencia');
  });
});
