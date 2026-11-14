import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';
import { NEVER, Subject, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

import { installBBoxPolyfill } from '../../testing/bbox-polyfill';
import { sampleDocument } from '../../testing/sample-document';
import { newDocument, newShape, type VectorDocument } from '../model/document';
import { setKeyframe } from '../model/edits';
import { provideVectorEditor } from '../provide-vector-editor';
import type { SinkDraft, VectorPartSink } from './sink';
import { sizeText, VectorSend } from './send';

const draft = (patch: Partial<SinkDraft> = {}): SinkDraft => ({ id: 'd1', state: 'ready', problems: [], previews: ['/p/0.png', '/p/1.png', '/p/2.png', '/p/3.png'], ...patch });

type Fake = { [K in keyof VectorPartSink]: Mock<VectorPartSink[K]> };

function fakeSink(patch: Partial<VectorPartSink> = {}): Fake {
  const sink = {
    isNameFree: vi.fn(() => of(true)),
    createDraft: vi.fn(() => of(draft())),
    followDraft: vi.fn(() => of(draft())),
    approve: vi.fn(() => of(undefined)),
    replace: vi.fn(() => of(undefined)),
    ...patch,
  };
  return sink as unknown as Fake;
}

async function setup(sink: VectorPartSink, doc: VectorDocument = { ...sampleDocument(), name: 'Spin Logo' }, lang: 'es' | 'en' = 'en') {
  TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang }), provideLabForms({ lang })] });
  const fixture: ComponentFixture<VectorSend> = TestBed.createComponent(VectorSend);
  fixture.componentRef.setInput('doc', doc);
  fixture.componentRef.setInput('sink', sink);
  const sent: string[] = [];
  fixture.componentInstance.sent.subscribe((n) => sent.push(n));
  fixture.componentRef.setInput('open', true);
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const click = async (id: string): Promise<void> => {
    q(id)!.click();
    await settle();
  };
  return { fixture, el, q, click, settle, sent };
}

describe('lab-vector-send', () => {
  beforeAll(() => {
    installBBoxPolyfill();
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  it('starts from the document: its name as the part’s, and Send is ready', async () => {
    const { el, q } = await setup(fakeSink());
    const name = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(name.value).toBe('spin-logo');
    expect(q<HTMLButtonElement>('send-confirm')!.disabled).toBe(false);
  });

  it('makes a draft, shows the server’s four pictures when it is ready, and approves on Approve', async () => {
    const sink = fakeSink();
    const { q, click, sent, el } = await setup(sink);
    await click('send-confirm');
    expect(sink.isNameFree).toHaveBeenCalledWith('spin-logo');
    expect(sink.createDraft).toHaveBeenCalledTimes(1);
    const files = sink.createDraft.mock.calls[0][0];
    expect(JSON.parse(files.manifest)).toMatchObject({ name: 'spin-logo', description: 'Spin Logo', cost_ms: 40, levels: ['simple', 'medium', 'advanced'] });
    expect(files.fragment).toContain('window.__partSeek');
    expect(el.querySelectorAll('[data-testid="send-previews"] img')).toHaveLength(4);
    expect(sink.approve).not.toHaveBeenCalled();
    await click('send-approve');
    expect(sink.approve).toHaveBeenCalledWith('d1');
    expect(q('send-done')!.textContent).toContain('"spin-logo" is in the catalog');
    expect(sent).toEqual(['spin-logo']);
  });

  it('follows a draft that is still being written until the server is done', async () => {
    const later = new Subject<SinkDraft>();
    const sink = fakeSink({ createDraft: vi.fn(() => of(draft({ state: 'writing', previews: [] }))), followDraft: vi.fn(() => later) });
    const { q, click, settle } = await setup(sink);
    await click('send-confirm');
    expect(q('send-working')!.textContent).toContain('writing and checking');
    expect(sink.followDraft).toHaveBeenCalledWith('d1');
    later.next(draft());
    await settle();
    expect(q('send-review')).not.toBeNull();
  });

  it('shows the server’s problems and keeps the form open when the draft fails, calling neither approve nor replace', async () => {
    const sink = fakeSink({ createDraft: vi.fn(() => of(draft({ state: 'failed', problems: ['the name is taken'], previews: [] }))) });
    const { q, click } = await setup(sink);
    await click('send-confirm');
    expect(q('send-problems')!.textContent).toContain('the name is taken');
    expect(q('send-confirm')).not.toBeNull();
    expect(q('send-approve')).toBeNull();
    expect(sink.approve).not.toHaveBeenCalled();
    expect(sink.replace).not.toHaveBeenCalled();
  });

  it('says when the name is taken, before asking the server for a draft', async () => {
    const sink = fakeSink({ isNameFree: vi.fn(() => of(false)) });
    const { q, click } = await setup(sink);
    await click('send-confirm');
    expect(q('send-problems')!.textContent).toContain('There is already a part called "spin-logo"');
    expect(sink.createDraft).not.toHaveBeenCalled();
  });

  it('says why when the sink fails', async () => {
    const { q, click } = await setup(fakeSink({ isNameFree: vi.fn(() => throwError(() => new Error('the server is down'))) }));
    await click('send-confirm');
    expect(q('send-problems')!.textContent).toContain('It was not sent: the server is down');
    expect(q('send-confirm')).not.toBeNull();
  });

  it('goes back to the form when Approve is refused, with the reason', async () => {
    const sink = fakeSink({ approve: vi.fn(() => throwError(() => new Error('the part does not draw'))) });
    const { q, click } = await setup(sink);
    await click('send-confirm');
    await click('send-approve');
    expect(q('send-review')).not.toBeNull();
  });

  it('offers Replace and Send as new for a document that came from the catalog, and replaces the part’s texts', async () => {
    const sink = fakeSink();
    const { q, click, sent } = await setup(sink, { ...sampleDocument(), name: 'Spin Logo', partName: 'spin-logo' });
    expect(q('send-replace')).not.toBeNull();
    expect(q('send-new')).not.toBeNull();
    expect(q('send-confirm')).toBeNull();
    expect(q('send')!.getAttribute('aria-label')).toBe('Send to catalog');
    await click('send-replace');
    expect(sink.replace).toHaveBeenCalledTimes(1);
    expect(sink.replace.mock.calls[0][0]).toBe('spin-logo');
    expect(JSON.parse(sink.replace.mock.calls[0][1].manifest).name).toBe('spin-logo');
    expect(sink.createDraft).not.toHaveBeenCalled();
    expect(q('send-done')!.textContent).toContain('was replaced');
    expect(sent).toEqual(['spin-logo']);
  });

  it('shows what the server refused a replacement for, and changes nothing', async () => {
    const sink = fakeSink({ replace: vi.fn(() => throwError(() => new Error('the part does not move'))) });
    const { q, click, sent } = await setup(sink, { ...sampleDocument(), name: 'Spin Logo', partName: 'spin-logo' });
    await click('send-replace');
    expect(q('send-problems')!.textContent).toContain('the part does not move');
    expect(sent).toEqual([]);
  });

  it('sends as new from a document that came from the catalog', async () => {
    const sink = fakeSink();
    const { click } = await setup(sink, { ...sampleDocument(), name: 'Spin Logo', partName: 'spin-logo' });
    await click('send-new');
    expect(sink.isNameFree).toHaveBeenCalledWith('spin-logo');
    expect(sink.createDraft).toHaveBeenCalled();
  });

  it('does not send a document that does not move, saying so', async () => {
    const still = newDocument({ name: 'Still', nodes: sampleDocument().nodes.map((n) => ({ ...n, children: [] })) });
    const sink = fakeSink();
    const { q } = await setup(sink, still);
    expect(q('send-still')!.textContent).toContain('does not move');
    expect(q<HTMLButtonElement>('send-confirm')!.disabled).toBe(true);
    expect(sink.isNameFree).not.toHaveBeenCalled();
  });

  it('closes with the × and speaks Spanish', async () => {
    const { q, fixture, settle } = await setup(fakeSink(), { ...sampleDocument(), name: 'Logo' }, 'es');
    expect(q('send')!.getAttribute('aria-label')).toBe('Enviar al catálogo');
    expect(q('send-confirm')!.textContent).toContain('Enviar');
    q('send-close')!.click();
    await settle();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('does not wait forever when nothing answers: it shows it is working and can be closed', async () => {
    const { q, click, fixture } = await setup(fakeSink({ isNameFree: vi.fn(() => NEVER) }));
    await click('send-confirm');
    expect(q('send-working')!.textContent).toContain('Checking the name');
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(q('send-working')).toBeNull();
  });

  it('says before sending that the part is over what the server takes (8 MiB), and does not send it', async () => {
    // A picture counts twice in the fragment: 4.5 million characters of data URL make a request of about 9 MB.
    let doc: VectorDocument = newDocument({ name: 'Heavy', duration: 4, nodes: [newShape('image', 'photo', 'Photo', { source: `data:image/png;base64,${'A'.repeat(4_500_000)}` })] });
    doc = setKeyframe(setKeyframe(doc, 'photo', 'opacity', 0, 0), 'photo', 'opacity', 4, 1);
    const sink = fakeSink();
    const { q, settle } = await setup(sink, doc);
    expect(q('send-too-big')!.textContent).toMatch(/server does not take requests over 8 MB/);
    expect(q<HTMLButtonElement>('send-confirm')!.disabled).toBe(true);
    await settle();
    expect(sink.createDraft).not.toHaveBeenCalled();
  });

  it('does not complain about the size of an ordinary part', async () => {
    const { q } = await setup(fakeSink());
    expect(q('send-too-big')).toBeNull();
  });

  it('says it in Spanish too', async () => {
    const doc = setKeyframe(setKeyframe(newDocument({ name: 'Heavy', nodes: [newShape('image', 'photo', 'Photo', { source: `data:image/png;base64,${'A'.repeat(4_500_000)}` })] }), 'photo', 'opacity', 0, 0), 'photo', 'opacity', 4, 1);
    const { q } = await setup(fakeSink(), doc, 'es');
    expect(q('send-too-big')!.textContent).toContain('el servidor no acepta envíos de más de 8 MB');
  });
});

describe('sizeText', () => {
  it('reads a size in KB under a megabyte and in MB above, with a decimal only when it is not whole', () => {
    expect(sizeText(1)).toBe('1 KB');
    expect(sizeText(22_550)).toBe('23 KB');
    expect(sizeText(1024 * 1024)).toBe('1 MB');
    expect(sizeText(8 * 1024 * 1024)).toBe('8 MB');
    expect(sizeText(9_300_000)).toBe('8.9 MB');
  });
});

