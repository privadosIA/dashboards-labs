import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideLabForms } from '@lab/forms-kit';
import { ANIMATION, InMemoryAnimation, provideMusicMotion, type AnimationPort } from '@lab/music-motion';
import { of, throwError } from 'rxjs';
import { allIds, newDocument, setKeyframe, toJson, toPart } from '@lab/vector-editor';
import { installBBoxPolyfill, SAMPLE_SVG, sampleDocument } from '@lab/vector-editor/testing';

import { DRAFT_DELAY_MS, DRAFT_KEY } from './draft-storage';
import { provideVectorStudio } from '../provide-vector-studio';
import { DOWNLOAD } from './files/download';
import { EditorPage } from './editor.page';

let data: Map<string, string>;

function stubStorage(): void {
  data = new Map();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', { ...storage, getItem: () => null, setItem: () => undefined });
}

/** `start` keeps what the page does by itself: it starts with the example. Without it the page is emptied, which is what most tests begin from. */
function setup(lang: 'es' | 'en' = 'en', port?: AnimationPort, start = false) {
  const downloads: Array<{ file: string; text: string; mime: string }> = [];
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideVectorStudio({ lang, client: 'vector-studio', memory: true }), provideLabForms({ lang }), provideMusicMotion({ lang, client: 'vector-studio', memory: true }), { provide: DOWNLOAD, useValue: (file: string, text: string, mime: string) => downloads.push({ file, text, mime }) }, ...(port ? [{ provide: ANIMATION, useValue: port }] : [])],
  });
  const fixture: ComponentFixture<EditorPage> = TestBed.createComponent(EditorPage);
  if (!start) fixture.componentInstance.store.load(newDocument());
  const settle = (): void => {
    fixture.detectChanges();
    fixture.detectChanges();
  };
  settle();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`)!;
  const page = fixture.componentInstance;
  const click = (id: string): void => {
    q(id).click();
    settle();
  };
  return { fixture, el, q, page, store: page.store, downloads, settle, click };
}

describe('EditorPage', () => {
  beforeAll(() => {
    installBBoxPolyfill();
    // jsdom has no modal dialogs.
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  beforeEach(() => stubStorage());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts with the example and its first layer selected, so that the properties are on show, and it is not a change', () => {
    const { store, q, el } = setup('en', undefined, true);
    expect(store.doc().nodes.length).toBeGreaterThan(0);
    expect(store.doc().name).toBe('Example');
    expect(store.selection()).toEqual([store.doc().nodes[0].id]);
    expect(store.dirty()).toBe(false);
    expect(q('empty-hint')).toBeNull();
    expect(el.querySelector('[data-testid="vector-properties"]')).not.toBeNull();
  });

  it('does not start with the example when the last visit left a draft to offer', () => {
    data.set(DRAFT_KEY, JSON.stringify({ doc: sampleDocument(), at: 1 }));
    const { store, q } = setup('en', undefined, true);
    expect(q('draft-found')).not.toBeNull();
    expect(store.doc().nodes).toHaveLength(0);
  });

  it('shows the library’s layout with the toolbar of the dashboard', () => {
    const { q, el } = setup();
    expect(q('vector-page')).not.toBeNull();
    for (const id of ['open', 'save', 'export', 'send', 'undo', 'redo', 'help-open', 'doc-name']) expect(q(id)).not.toBeNull();
    expect(el.querySelector('[role="toolbar"]')!.getAttribute('aria-label')).toBe('Document tools');
  });

  it('opens an SVG as a new document named after the file, and says it was imported', async () => {
    const { page, q, store, settle } = setup();
    await page.openFile('logo.svg', SAMPLE_SVG);
    settle();
    expect(store.doc().name).toBe('logo');
    expect(store.doc().nodes[0].children.map((c) => c.id)).toEqual(['logo', 'tag']);
    expect(q('notice').textContent).toContain('"logo.svg" imported');
    expect(q('notice').textContent).toContain('1 elements have their fill or stroke set by a stylesheet');
    expect(store.dirty()).toBe(true);
    expect(q<HTMLInputElement>('doc-name').value).toBe('logo');
  });

  it('composes two files: both are in the tree with different ids, the second at the centre at half size, and the part carries both', async () => {
    const { page, q, store, settle, click } = setup();
    await page.openFile('logo.svg', SAMPLE_SVG);
    settle();
    await page.openFile('icon.svg', SAMPLE_SVG);
    settle();
    click('open-add');
    const [first, second] = store.doc().nodes;
    expect(first.transform).toMatchObject({ scaleX: 1, scaleY: 1, x: 0, y: 0 });
    expect(second.transform.scaleX).toBeCloseTo(second.transform.scaleY, 9);
    expect(second.transform.scaleX).toBeGreaterThan(0);
    // The centre of its drawing lands on the artboard's centre.
    const { viewBox } = store.doc();
    expect(second.transform.x + second.transform.anchorX).toBeCloseTo(viewBox.x + viewBox.width / 2, 3);
    expect(second.transform.y + second.transform.anchorY).toBeCloseTo(viewBox.y + viewBox.height / 2, 3);
    const ids = [...allIds(store.doc().nodes)];
    expect(new Set(ids).size).toBe(ids.length);
    const moving = setKeyframe(setKeyframe(store.doc(), 'dot', 'x', 0, 0), 'dot', 'x', 1, 30);
    const part = toPart(moving, { name: 'two-logos', description: 'Two logos' });
    if ('problems' in part) throw new Error(part.problems.join());
    expect(part.fragment.match(/ id="dot"/g)).toHaveLength(1);
    expect(part.fragment.match(/ id="import-2-dot"/g)).toHaveLength(1);
    expect(q('open-ask')).toBeNull();
  });

  it('asks what to do with an SVG when a document is open: add it as a node, or replace the document', async () => {
    const { page, q, store, settle, click } = setup();
    await page.openFile('logo.svg', SAMPLE_SVG);
    settle();
    await page.openFile('again.svg', SAMPLE_SVG);
    settle();
    expect(q('open-ask').textContent).toContain('"again.svg"');
    click('open-add');
    expect(store.doc().nodes).toHaveLength(2);
    expect(store.doc().nodes[1].id).toBe('import-2');
    expect(store.doc().nodes[1].children.map((c) => c.id)).toEqual(['import-2-logo', 'import-2-tag']);
    expect(store.doc().name).toBe('logo');
    await page.openFile('third.svg', SAMPLE_SVG);
    settle();
    click('open-new');
    expect(store.doc().nodes).toHaveLength(1);
    expect(store.doc().name).toBe('third');
    await page.openFile('fourth.svg', SAMPLE_SVG);
    settle();
    click('open-cancel');
    expect(store.doc().name).toBe('third');
  });

  it('loads a .vector.json as it was saved, and it is not unsaved work', async () => {
    const { page, store, settle } = setup();
    await page.openFile('work.vector.json', toJson(sampleDocument()));
    settle();
    expect(store.doc().name).toBe('work');
    expect(store.doc().nodes[0].id).toBe('sample');
    expect(store.dirty()).toBe(false);
  });

  it('refuses what is not a document or an SVG, saying why, and changes nothing', async () => {
    const { page, q, store, settle } = setup();
    await page.openFile('bad.vector.json', '{"version":1');
    settle();
    expect(q('notice').textContent).toContain('It could not be opened');
    await page.openFile('broken.svg', '<svg><g></svg>');
    settle();
    expect(q('notice').textContent).toContain('It is not an SVG');
    expect(store.doc().nodes).toEqual([]);
  });

  it('saves a .vector.json named after the document and then it is clean', async () => {
    const { page, store, downloads, settle, click, q } = setup();
    await page.openFile('My Logo.svg', SAMPLE_SVG);
    settle();
    click('save');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].file).toBe('my-logo.vector.json');
    expect(JSON.parse(downloads[0].text).name).toBe('My Logo');
    expect(store.dirty()).toBe(false);
    expect(q('notice').textContent).toContain('Saved as my-logo.vector.json');
  });

  it('goes from a file to a file: open an SVG, give a group two keyframes, export the animated SVG', async () => {
    const { page, store, downloads, settle, click } = setup();
    await page.openFile('logo.svg', SAMPLE_SVG);
    settle();
    store.apply((d) => setKeyframe(setKeyframe(d, 'logo', 'rotate', 0, 0), 'logo', 'rotate', 2, 90));
    click('export');
    click('export-animated');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].file).toBe('logo.svg');
    expect(downloads[0].text).toContain('VectorRuntime');
    expect(downloads[0].text).toContain('"rotate"');
  });

  it('exports a still at the playhead', async () => {
    const { page, store, downloads, settle, click } = setup();
    await page.openFile('logo.svg', SAMPLE_SVG);
    store.seek(1);
    settle();
    click('export');
    click('export-still');
    expect(downloads[0].file).toBe('logo-still.svg');
    expect(downloads[0].text).not.toContain('<script');
  });

  it('cannot export a part that does not move, and says why; the other exports work', async () => {
    const { page, q, settle, click } = setup();
    await page.openFile('logo.svg', SAMPLE_SVG);
    settle();
    click('export');
    expect(q<HTMLButtonElement>('export-part').disabled).toBe(true);
    expect(q('export-part-why').textContent).toContain('does not move');
    expect(q<HTMLButtonElement>('export-animated').disabled).toBe(false);
    expect(q<HTMLButtonElement>('export-still').disabled).toBe(false);
  });

  it('exports the part’s two files one after the other', async () => {
    vi.useFakeTimers();
    const { page, store, downloads, settle, click } = setup();
    await page.openFile('logo.svg', SAMPLE_SVG);
    store.apply((d) => setKeyframe(setKeyframe(d, 'logo', 'rotate', 0, 0), 'logo', 'rotate', 2, 90));
    settle();
    click('export');
    click('export-part');
    expect(downloads.map((d) => d.file)).toEqual(['manifest.json']);
    vi.advanceTimersByTime(1000);
    expect(downloads.map((d) => d.file)).toEqual(['manifest.json', 'part.html']);
    expect(JSON.parse(downloads[0].text).name).toBe('logo');
    expect(downloads[1].text).toContain('window.__partSeek');
  });

  it('keeps the work as a draft a second after a change, and offers it on the next visit', async () => {
    vi.useFakeTimers();
    const first = setup();
    await first.page.openFile('logo.svg', SAMPLE_SVG);
    first.settle();
    expect(data.has(DRAFT_KEY)).toBe(false);
    vi.advanceTimersByTime(DRAFT_DELAY_MS);
    expect(JSON.parse(data.get(DRAFT_KEY)!).doc.name).toBe('logo');
    TestBed.resetTestingModule();
    const second = setup();
    expect(second.q('draft-found').textContent).toContain('There is an unsaved document');
    second.click('draft-continue');
    expect(second.store.doc().name).toBe('logo');
    expect(second.store.selection()).toEqual([]);
    expect(second.store.dirty()).toBe(true);
    expect(second.el.querySelector('[data-testid="draft-found"]')).toBeNull();
  });

  it('forgets the draft when it is discarded and when the document is saved', async () => {
    vi.useFakeTimers();
    data.set(DRAFT_KEY, JSON.stringify({ doc: sampleDocument(), at: 1 }));
    const a = setup();
    a.click('draft-discard');
    expect(data.has(DRAFT_KEY)).toBe(false);
    await a.page.openFile('logo.svg', SAMPLE_SVG);
    vi.advanceTimersByTime(DRAFT_DELAY_MS);
    expect(data.has(DRAFT_KEY)).toBe(true);
    a.click('save');
    expect(data.has(DRAFT_KEY)).toBe(false);
  });

  it('ignores a draft that is not a document', () => {
    data.set(DRAFT_KEY, '{"doc":{"nope":1},"at":1}');
    const { el } = setup();
    expect(el.querySelector('[data-testid="draft-found"]')).toBeNull();
  });

  it('says when the draft cannot be kept', async () => {
    vi.useFakeTimers();
    const { page, q, settle } = setup();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    });
    await page.openFile('logo.svg', SAMPLE_SVG);
    settle();
    vi.advanceTimersByTime(DRAFT_DELAY_MS);
    settle();
    expect(q('notice').textContent).toContain('will not keep the draft');
  });

  it('asks before leaving with changes, and not without them', async () => {
    const { page, settle } = setup();
    expect(page.hasChanges()).toBe(false);
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
    await page.openFile('logo.svg', SAMPLE_SVG);
    settle();
    expect(page.hasChanges()).toBe(true);
    const loud = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(loud);
    expect(loud.defaultPrevented).toBe(true);
  });

  it('renames the document from the toolbar', () => {
    const { q, store, settle } = setup();
    const input = q<HTMLInputElement>('doc-name');
    input.value = 'Spinner';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    settle();
    expect(store.doc().name).toBe('Spinner');
  });

  it('has the shortcuts: Ctrl+S saves, Ctrl+E opens the export menu, ? opens the help, Ctrl+Z undoes', async () => {
    const { page, q, store, downloads, settle } = setup();
    await page.openFile('logo.svg', SAMPLE_SVG);
    settle();
    const press = (key: string, init: KeyboardEventInit = {}): void => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
      settle();
    };
    press('s', { ctrlKey: true });
    expect(downloads).toHaveLength(1);
    press('e', { ctrlKey: true });
    expect(q('export-menu')).not.toBeNull();
    press('?');
    expect(q<HTMLDialogElement>('help').hasAttribute('open') || q('help-close') !== null).toBe(true);
    store.apply((d) => ({ ...d, name: 'x' }));
    press('z', { ctrlKey: true });
    expect(store.doc().name).toBe('logo');
  });

  it('sends the document to the catalog and remembers the part, so the next send offers Replace', async () => {
    const { page, store, q, settle, click, fixture } = setup();
    await page.openFile('logo.svg', SAMPLE_SVG);
    store.apply((d) => setKeyframe(setKeyframe(d, 'logo', 'rotate', 0, 0), 'logo', 'rotate', 2, 90));
    settle();
    click('send');
    await fixture.whenStable();
    settle();
    q('send-confirm').click();
    await fixture.whenStable();
    settle();
    expect(q('send-review')).not.toBeNull();
    q('send-approve').click();
    await fixture.whenStable();
    settle();
    expect(q('send-done').textContent).toContain('"logo" is in the catalog');
    expect(store.doc().partName).toBe('logo');
    q('send-finish').click();
    settle();
    click('send');
    await fixture.whenStable();
    settle();
    expect(q('send-replace')).not.toBeNull();
  });

  it('loads the example: an animated logo, so Play shows something at once, with no request, and says what to do when the page is empty', async () => {
    // The library carries the example: a host that serves no `examples/logo.svg` still has the button working.
    const fetched = vi.fn(async () => ({ ok: false, status: 404 }));
    vi.stubGlobal('fetch', fetched);
    const { q, el, store, settle, click } = setup();
    expect(q('empty-hint').textContent).toContain('try the example');
    click('example-hint');
    await new Promise((r) => setTimeout(r));
    settle();
    expect(fetched).not.toHaveBeenCalled();
    expect(store.doc().name).toBe('Example');
    const ring = store.doc().nodes[0].children[0].children[0];
    expect(ring.id).toBe('ring');
    expect(ring.tracks.rotate!.map((f) => f.t)).toEqual([0, 4]);
    expect(store.doc().nodes[0].children[0].children.map((c) => c.id)).toEqual(['ring', 'dot', 'bar-a', 'bar-b', 'bar-c']);
    expect(el.querySelector('[data-testid="empty-hint"]')).toBeNull();
    expect(q('notice').textContent).not.toContain('could not be loaded');
  });

  describe('Describe', () => {
    const drawer = (options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}): InMemoryAnimation => {
      const data = new Map<string, string>();
      const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } as Storage;
      return new InMemoryAnimation({ storage, writeMs: 5, ...options });
    };
    const flush = async (fixture: ComponentFixture<EditorPage>, ms = 30): Promise<void> => {
      await new Promise((r) => setTimeout(r, ms));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    /** Opens the dialog, types a description and presses Draw; the model answers after a few milliseconds. */
    const ask = async (s: ReturnType<typeof setup>, text: string, button = 'describe'): Promise<void> => {
      s.click(button);
      await flush(s.fixture, 0);
      const box = s.el.querySelector<HTMLTextAreaElement>('[data-testid="describe-dialog"] textarea')!;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      await flush(s.fixture, 0);
      s.el.querySelector<HTMLButtonElement>('[data-testid="describe-confirm"]')!.click();
      await flush(s.fixture);
    };

    it('shows Describe in the toolbar and in the empty notice only when the server lists the svg feature', async () => {
      const yes = setup('en', drawer());
      await flush(yes.fixture, 0);
      expect(yes.q('describe')).not.toBeNull();
      expect(yes.q('describe-hint')).not.toBeNull();
      TestBed.resetTestingModule();
      const no = setup('en', drawer({ features: ['animate', 'layers'] }));
      await flush(no.fixture, 0);
      expect(no.el.querySelector('[data-testid="describe"]')).toBeNull();
      expect(no.el.querySelector('[data-testid="describe-hint"]')).toBeNull();
      expect(no.q('empty-hint')).not.toBeNull();
    });

    it('is not offered when the catalog cannot be read', async () => {
      const port = drawer();
      vi.spyOn(port, 'catalog').mockReturnValue(throwError(() => new Error('down')));
      const s = setup('en', port);
      await flush(s.fixture, 0);
      expect(s.el.querySelector('[data-testid="describe"]')).toBeNull();
    });

    it('goes from words to a document with the circle ready for keyframes, named after the description, and remembers the model', async () => {
      const s = setup('en', drawer());
      await flush(s.fixture, 0);
      await ask(s, 'A green circle');
      expect(s.store.doc().name).toBe('a-green-circle');
      const ids: string[] = [];
      const walk = (nodes: typeof s.store.doc extends () => infer D ? (D extends { nodes: infer N } ? N : never) : never): void => {
        for (const n of nodes as Array<{ id: string; children: unknown[] }>) {
          ids.push(n.id);
          walk(n.children as never);
        }
      };
      walk(s.store.doc().nodes as never);
      expect(ids).toContain('ring');
      expect(s.q('notice').textContent).toContain('"a-green-circle.svg" imported');
      expect(s.store.dirty()).toBe(true);
      expect(data.get('vector-studio.model')).toBe('qwen3:8b');
    });

    it('adds a second description to the document after asking, like a file', async () => {
      const s = setup('en', drawer());
      await flush(s.fixture, 0);
      await ask(s, 'a circle');
      await ask(s, 'some bars');
      expect(s.q('open-ask').textContent).toContain('"some-bars.svg"');
      s.click('open-add');
      expect(s.store.doc().nodes).toHaveLength(2);
    });

    it('cleans a script the model wrote, like any file, and says so', async () => {
      const port = drawer();
      vi.spyOn(port, 'writeSvg').mockReturnValue(of('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><circle id="c" cx="5" cy="5" r="3" onclick="x()"/></svg>'));
      const s = setup('en', port);
      await flush(s.fixture, 0);
      await ask(s, 'a circle');
      expect(s.q('notice').textContent).toContain('what a page must not run');
      expect(JSON.stringify(s.store.doc())).not.toContain('alert');
      expect(JSON.stringify(s.store.doc())).not.toContain('onclick');
    });

    it('treats an answer that is not an SVG as a problem and leaves the document as it was', async () => {
      const port = drawer();
      vi.spyOn(port, 'writeSvg').mockReturnValue(of('I cannot draw that.'));
      const s = setup('en', port);
      await flush(s.fixture, 0);
      await ask(s, 'a circle');
      expect(s.q('notice').classList.contains('problem')).toBe(true);
      expect(s.q('notice').textContent).toContain('It could not be opened');
      expect(s.store.doc().nodes).toHaveLength(0);
    });

    it('shows the server’s words when it refuses, inside the dialog, and changes nothing', async () => {
      const s = setup('en', drawer());
      await flush(s.fixture, 0);
      await ask(s, 'notsvg');
      expect(s.q('describe-problem').textContent).toContain('no <svg>');
      expect(s.store.doc().nodes).toHaveLength(0);
    });
  });

  it('speaks Spanish when asked', () => {
    const { q } = setup('es');
    expect(q('open').textContent).toContain('Abrir');
    expect(q('save').textContent).toContain('Guardar');
    expect(q('help-open').getAttribute('aria-label')).toBe('Ayuda');
  });
});
