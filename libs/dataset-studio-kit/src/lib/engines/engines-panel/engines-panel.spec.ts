import { TestBed } from '@angular/core/testing';
import { type Observable, of, throwError } from 'rxjs';

import { DATASET_STUDIO_OPTIONS } from '../../core/options';
import { kindOf } from '../../kinds/kinds';
import { InMemoryEngines } from '../in-memory';
import type { EnginesView } from '../model';
import { ENGINES, type EnginesPort } from '../port';
import { EnginesPanel } from './engines-panel';

async function create(kindId: 'video' | 'images' | 'graphics' | 'songs' | 'piece', port: EnginesPort = new InMemoryEngines(), lang: 'es' | 'en' = 'en') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: DATASET_STUDIO_OPTIONS, useValue: { lang } }, { provide: ENGINES, useValue: port }] });
  const fixture = TestBed.createComponent(EnginesPanel);
  fixture.componentRef.setInput('kind', kindOf(kindId));
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, panel: fixture.componentInstance };
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('EnginesPanel', () => {
  it('shows an engine this machine cannot run disabled with its reason, and preselects the next available one', async () => {
    const { el, panel } = await create('video');
    const h3 = q(el, 'engine-h3-full')!;
    expect(h3.dataset['state']).toBe('unavailable');
    expect(h3.querySelector<HTMLButtonElement>('button.pick')!.disabled).toBe(true);
    expect(q(el, 'reason-h3-full')!.textContent).toContain('not enough video memory');
    expect(panel.selected()).toBe('ltx');
    expect(q(el, 'engine-ltx')!.classList).toContain('card--chosen');
  });

  it('says where a time comes from (history, the catalog\'s table or the server) and, for a model with none, that there is no measurement yet', async () => {
    const { el } = await create('images');
    expect(q(el, 'time-v1-5-pruned-emaonly.safetensors')!.textContent).toMatch(/≈ 6 s per picture\s*\(median of your runs\)/);
    expect(q(el, 'time-juggernautXL_v9.safetensors')!.textContent).toMatch(/≈ 14 s per picture\s*\(catalog table at 1024x1024, estimated\)/);
    expect(q(el, 'time-ponyDiffusionV6XL.safetensors')!.textContent).toContain('No measurement yet on this machine');
    const video = await create('video');
    expect(q(video.el, 'time-ltx')!.textContent).toMatch(/≈ 180 s per clip at best quality\s*\(from the server\)/);
  });

  it('offers Start on a stopped music service and makes it selectable once started', async () => {
    const { fixture, el, panel } = await create('songs');
    expect(q(el, 'state-heartmula')!.textContent).toBe('Stopped');
    q(el, 'start-heartmula')!.click();
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    expect(q(el, 'state-heartmula')!.textContent).toBe('Available');
    expect(q(el, 'start-heartmula')).toBeNull();
    q(el, 'engine-heartmula')!.querySelector<HTMLButtonElement>('button.pick')!.click();
    expect(panel.selected()).toBe('heartmula');
  });

  it('names the reason of a service that cannot be used, in words', async () => {
    const { el } = await create('songs');
    expect(q(el, 'reason-diffrhythm2')!.textContent).toContain('no card with free memory');
  });

  it('says no image models are installed when the server lists none, and leaves nothing selected', async () => {
    const port: EnginesPort = { load: (): Observable<EnginesView> => of({ kind: 'images', cards: [] }), startMusic: () => of(undefined) };
    const { el, panel } = await create('images', port);
    expect(q(el, 'engines-empty')!.textContent).toContain('No image models');
    expect(panel.selected()).toBe('');
  });

  it('shows Chrome and the catalog\'s parts for graphics, the catalog\'s choices for the piece', async () => {
    const g = await create('graphics');
    expect(q(g.el, 'graphics-chrome')!.textContent).toContain('Chrome is on this server');
    expect(q(g.el, 'graphics-parts')!.textContent).toContain('24 parts');
    const p = await create('piece');
    expect(q(p.el, 'piece-catalog')!.textContent).toContain('typographic, illustrated');
  });

  it('says when the server could not be read and can try again', async () => {
    let fail = true;
    const port: EnginesPort = { load: () => (fail ? throwError(() => new Error('boom')) : of<EnginesView>({ kind: 'graphics', chrome: true, parts: 1 })), startMusic: () => of(undefined) };
    const { fixture, el } = await create('graphics', port);
    expect(q(el, 'engines-problem')!.textContent).toContain('boom');
    fail = false;
    q(el, 'engines-retry')!.click();
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    expect(q(el, 'graphics-parts')!.textContent).toContain('1 part');
  });

  it('speaks Spanish when the host does', async () => {
    const { el } = await create('video', new InMemoryEngines(), 'es');
    expect(q(el, 'reason-h3-full')).not.toBeNull();
    expect(q(el, 'time-ltx')!.textContent).toContain('por clip a la mejor calidad');
  });

  it('keeps asking about a service that is starting until it is up', async () => {
    let state: 'starting' | 'ready' = 'starting';
    let asked = 0;
    const port: EnginesPort = {
      load: () => (asked++, of<EnginesView>({ kind: 'music', cards: [{ id: 'ace-step', name: 'ACE-Step', state: 'ready', source: 'none', isDefault: true }, { id: 'heartmula', name: 'HeartMuLa', state, source: 'none' }] })),
      startMusic: () => of(undefined),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: DATASET_STUDIO_OPTIONS, useValue: { lang: 'en' } }, { provide: ENGINES, useValue: port }] });
    const fixture = TestBed.createComponent(EnginesPanel);
    fixture.componentRef.setInput('kind', kindOf('songs'));
    fixture.componentRef.setInput('pollMs', 5);
    const el = fixture.nativeElement as HTMLElement;
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 12));
    }
    expect(q(el, 'state-heartmula')!.textContent).toBe('Starting');
    expect(asked).toBeGreaterThan(1);
    state = 'ready';
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 12));
      fixture.detectChanges();
    }
    expect(q(el, 'state-heartmula')!.textContent).toBe('Available');
    const after = asked;
    await new Promise((r) => setTimeout(r, 40));
    expect(asked).toBe(after);
  });
});
