import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ASSIST_PROVIDERS, provideAssistKit } from '@lab/assist-kit';
import { FAKE_BUILTIN, FAKE_ROUTER, FakeProviders } from '@lab/assist-kit/testing';
import { provideLabForms } from '@lab/forms-kit';
import { NEVER, Subject, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';

import { provideVectorEditor } from '../provide-vector-editor';
import { VectorDescribe } from './describe';
import type { SinkModels, VectorSvgSink } from './sink';

const MODELS: SinkModels = { default: 'qwen3:8b', models: [{ name: 'qwen3:8b', sizeBytes: 5_200_000_000, fits: true }, { name: 'gemma4:26b', sizeBytes: 17_000_000_000, fits: false }, { name: 'llama3:8b', sizeBytes: 4_700_000_000, fits: true }] };
const SVG = '<svg viewBox="0 0 10 10"><circle id="ring" r="4"/></svg>';

type Fake = { [K in keyof VectorSvgSink]: Mock<VectorSvgSink[K]> };
const fakeSink = (patch: Partial<VectorSvgSink> = {}): Fake => ({ models: vi.fn(() => of(MODELS)), write: vi.fn(() => of(SVG)), ...patch }) as unknown as Fake;

async function setup(sink: VectorSvgSink, { lang = 'en', preferred = '' }: { lang?: 'es' | 'en'; preferred?: string } = {}) {
  TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang }), provideLabForms({ lang }), provideAssistKit({ lang }), { provide: ASSIST_PROVIDERS, useValue: new FakeProviders([FAKE_BUILTIN, FAKE_ROUTER], true) }] });
  const fixture: ComponentFixture<VectorDescribe> = TestBed.createComponent(VectorDescribe);
  fixture.componentRef.setInput('sink', sink);
  fixture.componentRef.setInput('preferred', preferred);
  const written: Array<{ svg: string; description: string; model: string; provider: string }> = [];
  fixture.componentInstance.written.subscribe((w) => written.push(w));
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  fixture.componentRef.setInput('open', true);
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`);
  const type = async (text: string): Promise<void> => {
    const box = el.querySelector('textarea')!;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    await settle();
  };
  const click = async (id: string): Promise<void> => {
    q(id)!.click();
    await settle();
  };
  type Internals = { assistant: { (): { provider: string; model: string }; set(v: { provider: string; model: string }): void } };
  const assistant = (): { provider: string; model: string } => (fixture.componentInstance as unknown as Internals).assistant();
  const choose = async (v: { provider: string; model: string }): Promise<void> => {
    (fixture.componentInstance as unknown as Internals).assistant.set(v);
    await settle();
  };
  return { fixture, el, q, type, click, settle, written, assistant, choose };
}

describe('lab-vector-describe', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });

  it('has the assistant picker with Add provider, starts from the model of the routing, and Draw needs a description', async () => {
    const { el, q, type, assistant } = await setup(fakeSink());
    expect(el.querySelector('lab-assistant-picker')).not.toBeNull();
    expect(q('add-provider-open')).not.toBeNull();
    expect(assistant()).toEqual({ provider: '', model: 'qwen3:8b' });
    expect(q<HTMLButtonElement>('describe-confirm')!.disabled).toBe(true);
    await type('a green ring');
    expect(q<HTMLButtonElement>('describe-confirm')!.disabled).toBe(false);
  });

  it('does not start from a model that does not fit: the remembered one if it fits, else the default, else the first that fits', async () => {
    expect((await setup(fakeSink(), { preferred: 'llama3:8b' })).assistant().model).toBe('llama3:8b');
    TestBed.resetTestingModule();
    expect((await setup(fakeSink(), { preferred: 'gemma4:26b' })).assistant().model).toBe('qwen3:8b');
    TestBed.resetTestingModule();
    const bigDefault: SinkModels = { default: 'gemma4:26b', models: MODELS.models };
    expect((await setup(fakeSink({ models: vi.fn(() => of(bigDefault)) }))).assistant().model).toBe('qwen3:8b');
  });

  it('writes with an external provider and its model, and says so when it emits', async () => {
    const sink = fakeSink();
    const { type, click, choose, written } = await setup(sink);
    await choose({ provider: 'router', model: 'gpt-x' });
    await type('a green ring');
    await click('describe-confirm');
    expect(sink.write).toHaveBeenCalledWith('a green ring', 'gpt-x', 'router');
    expect(written).toEqual([{ svg: SVG, description: 'a green ring', model: 'gpt-x', provider: 'router' }]);
  });

  it('sends the text and the model to write, waits saying which model, and emits the svg and closes', async () => {
    const answer = new Subject<string>();
    const sink = fakeSink({ write: vi.fn(() => answer) });
    const { fixture, q, type, click, settle, written } = await setup(sink);
    await type('  a green ring ');
    await click('describe-confirm');
    expect(sink.write).toHaveBeenCalledWith('a green ring', 'qwen3:8b', '');
    expect(q('describe-working')!.textContent).toContain('qwen3:8b');
    expect(q('describe-confirm')).toBeNull();
    answer.next(SVG);
    await settle();
    expect(written).toEqual([{ svg: SVG, description: 'a green ring', model: 'qwen3:8b', provider: '' }]);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('cancels the wait: unsubscribes and gives the form back with the text', async () => {
    let unsubscribed = false;
    const sink = fakeSink({ write: vi.fn(() => new (NEVER.constructor as typeof import('rxjs').Observable)((s) => () => (unsubscribed = true)) as never) });
    const { el, q, type, click, written } = await setup(sink);
    await type('a logo');
    await click('describe-confirm');
    await click('describe-cancel-write');
    expect(unsubscribed).toBe(true);
    expect(q('describe-working')).toBeNull();
    expect(el.querySelector('textarea')!.value).toBe('a logo');
    expect(written).toEqual([]);
  });

  it('closing the dialog while it writes cancels the request', async () => {
    let unsubscribed = false;
    const sink = fakeSink({ write: vi.fn(() => new (NEVER.constructor as typeof import('rxjs').Observable)((s) => () => (unsubscribed = true)) as never) });
    const { fixture, type, click, settle } = await setup(sink);
    await type('a logo');
    await click('describe-confirm');
    fixture.componentRef.setInput('open', false);
    await settle();
    expect(unsubscribed).toBe(true);
  });

  it('puts the reason above the form on a failure and keeps what was typed, ready to try again', async () => {
    const sink = fakeSink({ write: vi.fn(() => throwError(() => new Error('the model refused to write this text'))) });
    const { el, q, type, click, written } = await setup(sink);
    await type('something');
    await click('describe-confirm');
    expect(q('describe-problem')!.textContent).toContain('It was not drawn: the model refused to write this text');
    expect(el.querySelector('textarea')!.value).toBe('something');
    expect(q<HTMLButtonElement>('describe-confirm')!.disabled).toBe(false);
    expect(written).toEqual([]);
  });

  it('keeps the picker when the assistant cannot list models, and asks the server to choose', async () => {
    const sink = fakeSink({ models: vi.fn(() => throwError(() => new Error('no assistant'))) });
    const { el, type, click } = await setup(sink);
    expect(el.querySelector('lab-assistant-picker')).not.toBeNull();
    await type('a bar');
    await click('describe-confirm');
    expect(sink.write).toHaveBeenCalledWith('a bar', '', '');
  });

  it('starts empty each time it opens, and says its words in Spanish', async () => {
    const { fixture, el, type, settle } = await setup(fakeSink(), { lang: 'es' });
    expect(el.querySelector('h2')!.textContent).toContain('Describir un elemento');
    await type('un anillo');
    fixture.componentRef.setInput('open', false);
    await settle();
    fixture.componentRef.setInput('open', true);
    await settle();
    expect(el.querySelector('textarea')!.value).toBe('');
  });
});
