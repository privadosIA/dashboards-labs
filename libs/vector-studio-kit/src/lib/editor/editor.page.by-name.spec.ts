import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, InMemoryAnimation, provideMusicMotion, type AnimationPort } from '@lab/music-motion';
import { setKeyframe, toPart } from '@lab/vector-editor';
import { installBBoxPolyfill, sampleDocument } from '@lab/vector-editor/testing';
import { firstValueFrom, lastValueFrom, of, throwError } from 'rxjs';

import { provideVectorStudio } from '../provide-vector-studio';
import { DRAFT_KEY } from './draft-storage';
import { EditorPage } from './editor.page';

let data: Map<string, string>;

const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
};

/** A vector part of the user's in an in-memory catalog, sent the way the editor sends it. */
async function catalogWithPart(name: string): Promise<InMemoryAnimation> {
  const port = new InMemoryAnimation({ storage: memoryStorage() });
  const made = toPart(setKeyframe(sampleDocument(), 'tag', 'x', 0, 0), { name, description: 'A logo that turns' });
  if ('problems' in made) throw new Error(made.problems.join());
  const draft = await firstValueFrom(port.createDraftFromText(made));
  await lastValueFrom(port.approveDraft(draft.id));
  return port;
}

async function open(query: Record<string, string>, port: AnimationPort | Promise<AnimationPort>) {
  data = new Map();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', { ...storage, getItem: () => null, setItem: () => undefined });
  const resolved = await port;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideVectorStudio({ lang: 'en', client: 'vector-studio', memory: true }),
      provideLabForms({ lang: 'en' }),
      provideMusicMotion({ lang: 'en', client: 'vector-studio', memory: true }),
      { provide: ANIMATION, useValue: resolved },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(EditorPage);
  fixture.detectChanges();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, page: fixture.componentInstance, navigate, notice: () => el.querySelector('[data-testid="notice"]')?.textContent ?? '' };
}

describe('EditorPage opened by name (editor?part=<name>)', () => {
  beforeAll(() => {
    installBBoxPolyfill();
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens a vector part of the user\'s as the catalog does, says it opened, and takes the name out of the address', async () => {
    const { page, navigate, fixture, notice } = await open({ part: 'spin-logo' }, catalogWithPart('spin-logo'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.store.doc().partName).toBe('spin-logo');
    });
    expect(notice()).toContain('Opened "spin-logo"');
    expect(page.hasChanges()).toBe(false);
    expect(navigate).toHaveBeenCalledWith([], { queryParams: { part: null }, queryParamsHandling: 'merge', replaceUrl: true });
  });

  it('says why when the part is not there, and opens empty', async () => {
    const port = { catalog: () => of({ parts: [] }), partText: () => throwError(() => new Error('there is no part "ghost"')) } as unknown as AnimationPort;
    const { page, fixture, notice } = await open({ part: 'ghost' }, port);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(notice()).toContain('It could not be opened: "ghost": there is no part "ghost"');
    });
    expect(page.store.doc().partName).toBeUndefined();
    expect(page.hasChanges()).toBe(false);
  });

  it('says so when the part is not a vector part, and the draft of the last visit is still there', async () => {
    const port = { catalog: () => of({ parts: [] }), partText: () => of({ name: 'bars', manifest: '{}', fragment: '<div>bars</div>' }) } as unknown as AnimationPort;
    data = new Map();
    const { fixture, notice } = await open({ part: 'bars' }, port);
    data.set(DRAFT_KEY, '{"keep":true}');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(notice()).toContain('is not a vector part');
    });
    expect(data.get(DRAFT_KEY)).toBe('{"keep":true}');
  });

  it('is as it was with no part in the address: nothing is read', async () => {
    const partText = vi.fn();
    const port = { catalog: () => of({ parts: [] }), partText } as unknown as AnimationPort;
    const { navigate } = await open({}, port);
    expect(partText).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
