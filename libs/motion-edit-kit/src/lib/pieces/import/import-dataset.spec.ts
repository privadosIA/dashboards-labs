import { readFileSync } from 'node:fs';
import { MOTION_EDIT_OPTIONS } from '../../core/options';
import { join } from 'node:path';

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';

import { ImportDataset } from './import-dataset';

// Paths from the repository root: with --coverage `__dirname` is the root itself, not this file's folder.
const GOLDEN = join(process.cwd(), 'libs/animation-dataset/src/testing/golden');

const settle = async (fixture: ComponentFixture<unknown>) => {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
};

function create(lang: 'es' | 'en' = 'en', features?: string[]) {
  const data = new Map<string, string>([['motion-edit.lang', lang]]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 5, analyseMs: 20, writeMs: 20, ...(features ? { features } : {}) });
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang } }, provideRouter([]), { provide: ANIMATION, useValue: port }] });
  const fixture = TestBed.createComponent(ImportDataset);
  const el = fixture.nativeElement as HTMLElement;
  const get = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const pick = async (content: string, name = 'dataset.json') => {
    const input = get('file') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([content], name, { type: 'application/json' })], configurable: true });
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5));
      await settle(fixture);
    }
  };
  const until = async (done: () => boolean) => {
    for (let i = 0; i < 200 && !done(); i++) {
      await new Promise((r) => setTimeout(r, 10));
      await settle(fixture);
    }
  };
  return { fixture, el, get, pick, until, port };
}

const pick2 = (ctx: { pick: (content: string) => Promise<void> }, content: string): Promise<void> => ctx.pick(content);

const golden = (name: string): string => readFileSync(join(GOLDEN, `${name}.json`), 'utf8');

describe('ImportDataset', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the problems of a file that is not a dataset and creates nothing', async () => {
    const { fixture, get, pick, port } = create();
    await settle(fixture);
    await pick('{"format":"other"}');
    expect(get('problems')).not.toBeNull();
    expect(get('report')).toBeNull();
    expect(await firstValueFrom(port.pieces())).toHaveLength(0);
  });

  it('says so when the file is not JSON', async () => {
    const { fixture, get, pick } = create();
    await settle(fixture);
    await pick('not json');
    expect(get('problems')!.textContent).toContain('could not be read as JSON');
  });

  it('shows the report of a golden file before creating anything, then imports it and opens the animation', async () => {
    const { fixture, get, pick, until, port } = create();
    await settle(fixture);
    await pick(golden('typographic-simple'));
    expect(get('report')).not.toBeNull();
    expect(get('summary')).not.toBeNull();
    expect(await firstValueFrom(port.pieces())).toHaveLength(0);

    (get('confirm') as HTMLButtonElement).click();
    await until(() => get('done') !== null);
    expect(get('done')).not.toBeNull();
    expect(await firstValueFrom(port.pieces())).toHaveLength(1);

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (get('open-animation') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/pieces', expect.any(String)]);
  });

  it('cancelling the report leaves everything as it was', async () => {
    const { fixture, get, pick, port } = create();
    await settle(fixture);
    await pick(golden('typographic-simple'));
    (get('cancel') as HTMLButtonElement).click();
    await settle(fixture);
    expect(get('report')).toBeNull();
    expect(get('file')).not.toBeNull();
    expect(await firstValueFrom(port.pieces())).toHaveLength(0);
  });

  it('speaks Spanish when the dashboard does', async () => {
    const { fixture, el, pick } = create('es');
    await settle(fixture);
    await pick(golden('typographic-simple'));
    expect(el.textContent).toContain('Informe de la importación');
  });

  describe('a dataset with keyframes', () => {
    // The keyframes of the golden file are on `counter`: the in-memory server marks its `to` and `speed` animatable.
    const withKeyframes = (): string => golden('keyframes');

    it('imports it as it is where the server takes keyframes', async () => {
      const { fixture, get, pick, until, port } = create('en');
      await settle(fixture);
      await pick(withKeyframes());
      expect(get('drop-animate')).toBeNull();
      get('confirm')!.click();
      await until(() => get('done') !== null);
      const [piece] = await firstValueFrom(port.pieces());
      const detail = await firstValueFrom(port.piece(piece.id));
      expect(detail.script.pieces[0].animate?.['to']).toHaveLength(3);
    });

    it('says the server does not take them, and makes the animation without them only when asked to', async () => {
      const first = create('en', []);
      await settle(first.fixture);
      await pick2(first, withKeyframes());
      expect(first.get('report')!.textContent).toContain('The server does not take animated parameters');
      expect(first.get('report')!.textContent).toContain('p1: to, p1: speed, p2 (counter): to');
      expect(first.get('drop-animate')!.textContent).toContain('Make the animation without what this server does not take');
      // not agreed: the animation is left alone
      first.get('confirm')!.click();
      await first.until(() => first.get('done') !== null);
      expect(await firstValueFrom(first.port.pieces())).toHaveLength(0);
      expect(first.get('row-animation-0')!.textContent).toContain('Not done');
      TestBed.resetTestingModule();
      vi.unstubAllGlobals();
      const second = create('en', []);
      await settle(second.fixture);
      await pick2(second, withKeyframes());
      (second.get('drop-animate-check') as HTMLInputElement).click();
      second.get('confirm')!.click();
      await second.until(() => second.get('done') !== null);
      const [piece] = await firstValueFrom(second.port.pieces());
      const detail = await firstValueFrom(second.port.piece(piece.id));
      expect(JSON.stringify(detail.script)).not.toContain('animate');
    });

    it('says it in Spanish', async () => {
      const es = create('es', []);
      await settle(es.fixture);
      await pick2(es, withKeyframes());
      expect(es.get('drop-animate')!.textContent).toContain('Crear la animación sin lo que este servidor no admite');
    });
  });

  describe('a dataset with layers', () => {
    const withLayers = (): string => golden('layers');

    it('imports it as it is where the server takes layers', async () => {
      const { fixture, get, pick, until, port } = create('en');
      await settle(fixture);
      await pick(withLayers());
      expect(get('drop-animate')).toBeNull();
      get('confirm')!.click();
      await until(() => get('done') !== null);
      const [piece] = await firstValueFrom(port.pieces());
      expect((await firstValueFrom(port.piece(piece.id))).script.layers?.length).toBeGreaterThan(0);
    });

    it('says the server does not take them, and makes the animation without them only when asked to', async () => {
      const first = create('en', ['animate']);
      await settle(first.fixture);
      await pick2(first, withLayers());
      expect(first.get('report')!.textContent).toContain('The server does not take layers');
      expect(first.get('drop-animate')!.textContent).toContain('keyframes or layers');
      first.get('confirm')!.click();
      await first.until(() => first.get('done') !== null);
      expect(await firstValueFrom(first.port.pieces())).toHaveLength(0);
      TestBed.resetTestingModule();
      vi.unstubAllGlobals();
      const second = create('en', ['animate']);
      await settle(second.fixture);
      await pick2(second, withLayers());
      (second.get('drop-animate-check') as HTMLInputElement).click();
      second.get('confirm')!.click();
      await second.until(() => second.get('done') !== null);
      const [piece] = await firstValueFrom(second.port.pieces());
      expect((await firstValueFrom(second.port.piece(piece.id))).script.layers).toBeUndefined();
    });
  });
});
