import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { provideLabForms } from '@lab/forms-kit';
import { beatOfSlice, provideMotionEditor, sliceSongMap } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';
import { installBBoxPolyfill, sampleDocument, SAMPLE_SVG } from '@lab/vector-editor/testing';
import { provideVectorEditor, setBeatLink, setKeyframe, toPart, type VectorDocument, type VectorStore } from '@lab/vector-editor';

import { stubStorage } from '../../testing/memory-storage';
import { AUDIO_FACTORY } from './audio';
import { MONACO } from './code/code-pane/code-pane';
import { EditorPage } from './editor.page';

class FakeAudio {
  currentTime = 0;
  paused = true;
  constructor(public src: string) {}
  play = () => ((this.paused = false), Promise.resolve());
  pause = () => void (this.paused = true);
  addEventListener = () => undefined;
  removeEventListener = () => undefined;
}

/** A vector part of the catalog: the sample logo, moving, approved in the in-memory server under `name`. */
async function approveVectorPart(port: InMemoryAnimation, name: string): Promise<VectorDocument> {
  const doc = sampleDocument();
  const made = toPart(doc, { name, description: 'A logo that turns' });
  if ('problems' in made) throw new Error(made.problems.join());
  const draft = await firstValueFrom(port.createDraftFromText({ manifest: made.manifest, fragment: made.fragment }));
  await vi.waitFor(async () => expect((await firstValueFrom(port.drafts())).find((d) => d.id === draft.id)?.state).toBe('ready'), { timeout: 3000 });
  await firstValueFrom(port.approveDraft(draft.id));
  return doc;
}

async function setup(prepare?: (port: InMemoryAnimation) => Promise<unknown>) {
  stubStorage({ 'motion-edit.lang': 'en' });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, writeMs: 20 });
  await firstValueFrom(port.loadSample());
  await prepare?.(port);
  TestBed.configureTestingModule({
    providers: [
      { provide: MONACO, useValue: () => Promise.reject(new Error('no monaco in tests')) },
      provideRouter([]),
      provideHttpClient(),
      provideServerConnection({ lang: 'en' }),
      provideLabForms({ lang: 'en' }),
      provideMotionParts({ lang: 'en' }),
      provideMotionEditor({ lang: 'en' }),
      provideVectorEditor({ lang: 'en' }),
      { provide: ANIMATION, useValue: port },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'sample-piece' })), queryParamMap: of(convertToParamMap({})) } },
      { provide: AUDIO_FACTORY, useValue: (src: string) => new FakeAudio(src) },
    ],
  });
  const fixture = TestBed.createComponent(EditorPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async (check: () => void) => {
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        check();
      },
      { timeout: 3000 },
    );
  };
  await settle(() => expect(el.querySelector('lab-motion-timeline')).not.toBeNull());
  const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const page = fixture.componentInstance as unknown as {
    vector: { store(): VectorStore | null; dirty(): boolean; partName(): string | null };
    pages(): readonly { id: string; html: string }[];
    doc(): { script: { pieces: { start: number; end: number }[] } };
    view(): string;
  };
  /** Chooses the first piece, adds `part` to it as an extra, and chooses that extra. */
  const chooseExtra = async (part: string) => {
    (el.querySelector('lab-motion-timeline .lane.main .block') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    q('tab-library')!.click();
    fixture.detectChanges();
    (el.querySelector(`lab-parts-palette [data-part="${part}"] [data-testid="palette-add"]`) as HTMLElement).click();
    await settle(() => expect(el.querySelector('lab-motion-timeline .lane.extra .extra-block')).not.toBeNull());
    (el.querySelector('lab-motion-timeline .lane.extra .extra-block') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
  };
  return { fixture, el, port, q, settle, page, chooseExtra };
}

describe('EditorPage, the Vector tab', () => {
  beforeAll(() => {
    installBBoxPolyfill();
    const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('is off with nothing chosen, and off with a part that is not a vector part, saying why', async () => {
    const { q, settle, el, fixture } = await setup();
    expect((q('view-vector') as HTMLButtonElement).disabled).toBe(true);
    expect(q('vector-off')!.textContent).toContain('Pick a part on the timeline');
    (el.querySelector('lab-motion-timeline .lane.main .block') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle(() => expect(q('vector-off')!.textContent).toContain('Not a vector part'));
    expect((q('view-vector') as HTMLButtonElement).disabled).toBe(true);
    expect(fixture.componentInstance).toBeDefined();
  });

  it('opens a vector part from the chosen extra in the Vector tab, with its name and no dirty mark', async () => {
    const { q, settle, chooseExtra, page } = await setup((port) => approveVectorPart(port, 'spin-logo'));
    await chooseExtra('spin-logo');
    await settle(() => expect((q('view-vector') as HTMLButtonElement).disabled).toBe(false));
    q('view-vector')!.click();
    await settle(() => expect(q('vector-tab')).not.toBeNull());
    expect(page.view()).toBe('vector');
    expect(q('vector-title')!.textContent).toContain('spin-logo');
    expect(q('vector-dirty')).toBeNull();
    expect(page.vector.partName()).toBe('spin-logo');
    expect(q('vector-tab')!.querySelector('lab-vector-editor-page')).not.toBeNull();
    await settle(() => expect(q('vector-view')!.closest('.grid')!.classList.contains('vector-view')).toBe(true));
  });

  it('shows the beats of the piece in the canvas: a pulse on a node is scaled where the beat has just struck', async () => {
    const { q, settle, chooseExtra, page, fixture, port } = await setup((p) => approveVectorPart(p, 'spin-logo'));
    await chooseExtra('spin-logo');
    await settle(() => expect((q('view-vector') as HTMLButtonElement).disabled).toBe(false));
    q('view-vector')!.click();
    await settle(() => expect(q('vector-tab')).not.toBeNull());
    const store = page.vector.store()!;
    store.apply((d) => setBeatLink(d, 'tag', 'scaleX', { kind: 'pulse', amount: 0.3, decay: 3 }));
    fixture.detectChanges();
    const canvas = q('vector-tab')!.querySelector('lab-vector-canvas') as HTMLElement;
    const scale = (): number => {
      const t = canvas.querySelector('[data-testid="content"] [id="tag"]')!.getAttribute('transform') ?? '';
      const nums = t.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      return nums.length >= 4 ? nums[nums.length - 4] : 1;
    };
    // The canvas pulses with the beats of the piece the part was opened from: at a beat the node is scaled by the whole amount, half way to the next by less.
    const piece = await firstValueFrom(port.piece('sample-piece'));
    const block = page.doc().script.pieces[0];
    const slice = sliceSongMap(piece.songMap, block.start, block.end);
    const beat = slice.beats.find((b) => b > 0.01)!;
    const period = slice.beats[slice.beats.indexOf(beat) + 1] - beat;
    const expected = (t: number): number => 1 + 0.3 * Math.pow(1 - beatOfSlice(slice, t).position, 3);
    for (const t of [beat, beat + period / 2, beat + period * 0.9]) {
      store.seek(t);
      fixture.detectChanges();
      expect(scale(), `at ${t}`).toBeCloseTo(expected(t), 3);
    }
    store.seek(beat);
    fixture.detectChanges();
    const struck = scale();
    store.seek(beat + period / 2);
    fixture.detectChanges();
    expect(struck).toBeGreaterThan(scale());
    expect(scale()).toBeGreaterThan(1);
  });

  it('saves a changed part with Replace: the catalog has the new texts and the preview of the scenes that draw it is rebuilt', async () => {
    const { q, settle, chooseExtra, page, port, fixture } = await setup((p) => approveVectorPart(p, 'spin-logo'));
    await chooseExtra('spin-logo');
    await settle(() => expect((q('view-vector') as HTMLButtonElement).disabled).toBe(false));
    q('view-vector')!.click();
    await settle(() => expect(q('vector-tab')).not.toBeNull());
    page.vector.store()!.apply((d) => setKeyframe(d, 'dot', 'x', 3, 777));
    fixture.detectChanges();
    expect(q('vector-dirty')).not.toBeNull();
    expect(q('vector-tab-dirty')).not.toBeNull();
    q('vector-save')!.click();
    await settle(() => expect(q('send-replace')).not.toBeNull());
    q('send-replace')!.click();
    await settle(() => expect(q('send-done')).not.toBeNull());
    expect((await firstValueFrom(port.partText('spin-logo'))).fragment).toContain('777');
    await settle(() => expect(page.pages().some((p) => p.html.includes('777'))).toBe(true));
    expect(page.vector.dirty()).toBe(false);
    expect(q('vector-dirty')).toBeNull();
    expect(q('notice')!.textContent).toContain('spin-logo');
  });

  it('asks Save, Discard or Stay before leaving the Vector tab for Code with changes, and Stay changes nothing', async () => {
    const { q, settle, chooseExtra, page, fixture } = await setup((p) => approveVectorPart(p, 'spin-logo'));
    await chooseExtra('spin-logo');
    await settle(() => expect((q('view-vector') as HTMLButtonElement).disabled).toBe(false));
    q('view-vector')!.click();
    await settle(() => expect(q('vector-tab')).not.toBeNull());
    page.vector.store()!.apply((d) => setKeyframe(d, 'dot', 'x', 3, 777));
    q('view-code')!.click();
    await settle(() => expect(q('vector-leave-text')).not.toBeNull());
    expect(q('vector-leave-text')!.textContent).toContain('spin-logo');
    q('vector-leave-stay')!.click();
    await settle(() => expect(q('vector-leave-text')).toBeNull());
    expect(page.view()).toBe('vector');
    expect(page.vector.dirty()).toBe(true);
    q('view-code')!.click();
    await settle(() => expect(q('vector-leave-discard')).not.toBeNull());
    q('vector-leave-discard')!.click();
    await settle(() => expect(page.view()).toBe('code'));
    expect(page.vector.dirty()).toBe(false);
    expect(fixture.componentInstance).toBeDefined();
  });

  it('keeps the changes while the Visual view is shown, and the tab says it has them', async () => {
    const { q, settle, chooseExtra, page } = await setup((p) => approveVectorPart(p, 'spin-logo'));
    await chooseExtra('spin-logo');
    await settle(() => expect((q('view-vector') as HTMLButtonElement).disabled).toBe(false));
    q('view-vector')!.click();
    await settle(() => expect(q('vector-tab')).not.toBeNull());
    page.vector.store()!.apply((d) => setKeyframe(d, 'dot', 'x', 3, 777));
    q('view-visual')!.click();
    await settle(() => expect(page.view()).toBe('visual'));
    expect(page.vector.dirty()).toBe(true);
    expect(q('vector-tab-dirty')).not.toBeNull();
  });

  it('keeps its own guard apart from the script’s: leaving the page with vector changes asks about them first', async () => {
    const { settle, chooseExtra, page, fixture, q } = await setup((p) => approveVectorPart(p, 'spin-logo'));
    await chooseExtra('spin-logo');
    await settle(() => expect((q('view-vector') as HTMLButtonElement).disabled).toBe(false));
    q('view-vector')!.click();
    await settle(() => expect(q('vector-tab')).not.toBeNull());
    const editor = fixture.componentInstance;
    expect(editor.hasVectorChanges()).toBe(false);
    page.vector.store()!.apply((d) => setKeyframe(d, 'dot', 'x', 3, 777));
    expect(editor.hasVectorChanges()).toBe(true);
    expect(editor.hasChanges()).toBe(true);
    const leaving = editor.confirmVectorLeave();
    await settle(() => expect(q('vector-leave-stay')).not.toBeNull());
    q('vector-leave-stay')!.click();
    expect(await leaving).toBe(false);
  });

  it('lists the tab’s shortcuts in the Help', async () => {
    const { q, settle } = await setup();
    q('help-open')?.click();
    await settle(() => expect(q('help-vector')).not.toBeNull());
    expect(q('help-vector')!.textContent).toContain('Vector tab');
  });

  describe('New vector part…', () => {
    const choose = async (q: (id: string) => HTMLElement | null, fixture: { detectChanges(): void }, name: string, text: string) => {
      const input = q('new-vector-file') as HTMLInputElement;
      const file = new File([text], name, { type: 'image/svg+xml' });
      (file as unknown as { text: () => Promise<string> }).text = async () => text;
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();
    };

    it('opens the Vector tab on a new document made from an SVG, sends it, approves it, lists it in the library and stays on it in Replace mode', async () => {
      const { q, el, settle, page, fixture } = await setup();
      expect(q('new-vector-open')).not.toBeNull();
      await choose(q, fixture, 'logo.svg', SAMPLE_SVG);
      await settle(() => expect(q('vector-tab')).not.toBeNull());
      expect(page.view()).toBe('vector');
      expect(q('vector-title')!.textContent).toContain('New vector part');
      expect(page.vector.partName()).toBeNull();
      // One keyframe pair, so that the part moves.
      page.vector.store()!.apply((d) => setKeyframe(setKeyframe(d, 'dot', 'x', 0, 0), 'dot', 'x', 2, 40));
      fixture.detectChanges();
      q('vector-save')!.click();
      await settle(() => expect(q('send-confirm')).not.toBeNull());
      expect(q('vector-save-new')).toBeNull();
      q('send-confirm')!.click();
      await settle(() => expect(q('send-approve')).not.toBeNull(), );
      q('send-approve')!.click();
      await settle(() => expect(q('send-done')).not.toBeNull());
      await settle(() => expect(el.querySelector('lab-parts-palette [data-part="logo"]')).not.toBeNull());
      expect(page.vector.partName()).toBe('logo');
      expect(q('vector-title')!.textContent).toContain('logo');
      expect(page.vector.dirty()).toBe(false);
      expect(q('vector-save-new')).not.toBeNull();
    });

    it('says so when the file is not an SVG, and when it cannot be opened, and changes nothing', async () => {
      const { q, settle, page, fixture } = await setup();
      await choose(q, fixture, 'notes.txt', 'hello');
      await settle(() => expect(q('notice')!.textContent).toContain('is not an SVG'));
      await choose(q, fixture, 'broken.svg', 'hello');
      await settle(() => expect(q('notice')!.textContent).toContain('could not be opened'));
      expect(page.vector.partName()).toBeNull();
      expect(q('vector-tab')).toBeNull();
    });

    it('asks first when another vector part has changes, and Stay keeps the part that was open', async () => {
      const { q, settle, chooseExtra, page, fixture } = await setup((p) => approveVectorPart(p, 'spin-logo'));
      await chooseExtra('spin-logo');
      await settle(() => expect((q('view-vector') as HTMLButtonElement).disabled).toBe(false));
      q('view-vector')!.click();
      await settle(() => expect(q('vector-tab')).not.toBeNull());
      page.vector.store()!.apply((d) => setKeyframe(d, 'dot', 'x', 3, 777));
      await choose(q, fixture, 'logo.svg', SAMPLE_SVG);
      await settle(() => expect(q('vector-leave-stay')).not.toBeNull());
      q('vector-leave-stay')!.click();
      await settle(() => expect(q('vector-leave-text')).toBeNull());
      expect(page.vector.partName()).toBe('spin-logo');
      expect(page.vector.dirty()).toBe(true);
    });
  });
});

