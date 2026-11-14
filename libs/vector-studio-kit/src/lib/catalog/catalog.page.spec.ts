import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AnimationFailure, ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { setKeyframe, toPart, type PartFiles } from '@lab/vector-editor';
import { installBBoxPolyfill, sampleDocument } from '@lab/vector-editor/testing';
import { firstValueFrom, lastValueFrom, of, throwError } from 'rxjs';

import { stubStorage } from '../../testing/memory-storage';
import { Handoff } from '../core/handoff';
import { CatalogPage } from './catalog.page';

const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } as unknown as Storage;
};

function files(name: string, description = 'A logo that turns'): PartFiles {
  const made = toPart(setKeyframe(sampleDocument(), 'tag', 'x', 0, 0), { name, description });
  if ('problems' in made) throw new Error(made.problems.join());
  return made;
}

/** Puts a part of the user's in the catalog the way the editor does: a draft from the exported files, approved. */
async function send(port: InMemoryAnimation, name: string, description?: string): Promise<void> {
  const d = await firstValueFrom(port.createDraftFromText(files(name, description)));
  await lastValueFrom(port.approveDraft(d.id));
}

async function setup(port: InMemoryAnimation | { catalog: () => unknown; [k: string]: unknown } = new InMemoryAnimation({ storage: memoryStorage() })) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ANIMATION, useValue: port }] });
  const fixture: ComponentFixture<CatalogPage> = TestBed.createComponent(CatalogPage);
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const click = async (id: string, within?: string): Promise<void> => {
    (within ? q(within)! : el).querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click();
    await settle();
  };
  return { fixture, el, q, click, settle, port };
}

describe('CatalogPage', () => {
  beforeAll(() => installBBoxPolyfill());
  beforeEach(() => stubStorage());
  afterEach(() => vi.unstubAllGlobals());

  it('starts empty in memory: the sample’s own parts are not vector parts', async () => {
    const { q } = await setup();
    expect(q('empty')!.textContent).toContain('no vector parts yet');
  });

  it('lists a vector part that was sent, with its still thumbnail, name and description', async () => {
    const port = new InMemoryAnimation({ storage: memoryStorage() });
    await send(port, 'spin-logo');
    const { q, el } = await setup(port);
    expect(q('part-spin-logo')).not.toBeNull();
    expect(q('part-spin-logo')!.textContent).toContain('A logo that turns');
    const src = el.querySelector<HTMLImageElement>('[data-testid="thumb"]')!.getAttribute('src')!;
    expect(src.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(src)).toContain('id="dot"');
    expect(decodeURIComponent(src)).not.toContain('<script');
  });

  it('does not list a part of the user’s that is not a vector part, nor one that vanished', async () => {
    const port = new InMemoryAnimation({ storage: memoryStorage() });
    await send(port, 'spin-logo');
    const plain = await firstValueFrom(
      port.createDraftFromText({
        manifest: JSON.stringify({ name: 'plain-bars', description: 'Bars', version: 1, levels: ['simple'], cost_ms: 40, params: [] }),
        fragment: '<style>.a{position:absolute}</style><div class="a"></div><script>window.__partSeek = function (t) { document.querySelector(".a").style.opacity = String(t % 1); };</script>',
      }),
    );
    if (plain.state === 'ready') await lastValueFrom(port.approveDraft(plain.id));
    const { el } = await setup(port);
    expect(Array.from(el.querySelectorAll('app-part-card h3')).map((h) => h.textContent)).toEqual(['spin-logo']);
  });

  it('opens a part in the editor: the document is handed over with the part’s name, and the router goes there', async () => {
    const port = new InMemoryAnimation({ storage: memoryStorage() });
    await send(port, 'spin-logo');
    const { click } = await setup(port);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await click('open-part', 'part-spin-logo');
    expect(navigate).toHaveBeenCalledWith(['', 'editor']);
    const doc = TestBed.inject(Handoff).take()!;
    expect(doc.partName).toBe('spin-logo');
    expect(doc.name).toBe('spin-logo');
    expect(doc.nodes[0].id).toBe('sample');
    expect(TestBed.inject(Handoff).take()).toBeUndefined();
  });

  it('asks before deleting, and deletes the part from the catalog', async () => {
    const port = new InMemoryAnimation({ storage: memoryStorage() });
    await send(port, 'spin-logo');
    await send(port, 'other-logo');
    const { q, click } = await setup(port);
    await click('remove-part', 'part-spin-logo');
    expect(q('ask')!.textContent).toContain('Delete the part "spin-logo"?');
    await click('cancel-remove', 'part-spin-logo');
    expect(q('part-spin-logo')).not.toBeNull();
    await click('remove-part', 'part-spin-logo');
    await click('confirm-remove', 'part-spin-logo');
    expect(q('part-spin-logo')).toBeNull();
    expect(q('part-other-logo')).not.toBeNull();
    expect((await firstValueFrom(port.catalog())).parts.some((p) => p.name === 'spin-logo')).toBe(false);
  });

  it('shows the server’s reason when pieces use the part, and deletes anyway when asked', async () => {
    const port = new InMemoryAnimation({ storage: memoryStorage() });
    await send(port, 'spin-logo');
    const real = port.removePart.bind(port);
    const calls: boolean[] = [];
    port.removePart = (name: string, force?: boolean) => {
      calls.push(!!force);
      return force ? real(name, true) : throwError(() => new AnimationFailure('busy', 'the piece "Song" uses it'));
    };
    const { q, click } = await setup(port);
    await click('remove-part', 'part-spin-logo');
    await click('confirm-remove', 'part-spin-logo');
    expect(q('ask')!.textContent).toContain('"spin-logo" is in use: the piece "Song" uses it');
    expect(q('confirm-remove')!.textContent).toContain('Delete anyway');
    await click('confirm-remove', 'part-spin-logo');
    expect(calls).toEqual([false, true]);
    expect(q('part-spin-logo')).toBeNull();
  });

  it('says what the server refused for another reason', async () => {
    const port = new InMemoryAnimation({ storage: memoryStorage() });
    await send(port, 'spin-logo');
    port.removePart = () => throwError(() => new AnimationFailure('refused', 'it comes with the program'));
    const { q, click } = await setup(port);
    await click('remove-part', 'part-spin-logo');
    await click('confirm-remove', 'part-spin-logo');
    expect(q('notice')!.textContent).toContain('The server did not delete it: it comes with the program');
    expect(q('part-spin-logo')).not.toBeNull();
  });

  it('says the catalog needs a server when the server cannot be reached, and tries again', async () => {
    let up = false;
    const inner = new InMemoryAnimation({ storage: memoryStorage() });
    const port = { catalog: () => (up ? inner.catalog() : throwError(() => new AnimationFailure('unavailable', 'connection refused'))), partText: () => of(undefined) };
    const { q, click } = await setup(port as never);
    expect(q('needs-server')!.textContent).toContain('The catalog needs a server');
    expect(q('needs-server')!.textContent).toContain('connection refused');
    up = true;
    await click('retry');
    expect(q('needs-server')).toBeNull();
    expect(q('empty')).not.toBeNull();
  });

  it('pages the cards like the other lists: ten to a page, with a paginator only when there are more', async () => {
    const port = new InMemoryAnimation({ storage: memoryStorage() });
    for (let i = 1; i <= 11; i++) await send(port, `logo-${String(i).padStart(2, '0')}`);
    const { el, settle } = await setup(port);
    expect(el.querySelectorAll('app-part-card')).toHaveLength(10);
    const paginator = el.querySelector('mat-paginator');
    expect(paginator).not.toBeNull();
    (el.querySelector('.mat-mdc-paginator-navigation-next') as HTMLButtonElement).click();
    await settle();
    expect(Array.from(el.querySelectorAll('app-part-card h3')).map((h) => h.textContent)).toEqual(['logo-11']);
  });

  it('shows no paginator for a few parts', async () => {
    const port = new InMemoryAnimation({ storage: memoryStorage() });
    await send(port, 'spin-logo');
    const { el } = await setup(port);
    expect(el.querySelector('mat-paginator')).toBeNull();
  });

  it('reads the catalog again on request', async () => {
    const port = new InMemoryAnimation({ storage: memoryStorage() });
    const { q, click } = await setup(port);
    expect(q('empty')).not.toBeNull();
    await send(port, 'late-logo');
    await click('reload');
    expect(q('part-late-logo')).not.toBeNull();
  });
});
