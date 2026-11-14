import { TestBed } from '@angular/core/testing';

import { MOTION_EDIT_OPTIONS } from '../../../../core/options';
import { stubStorage } from '../../../../../testing/memory-storage';
import { MONACO } from '../../../code/code-pane/code-pane';
import type { MonacoApi } from '../../../code/monaco-loader';
import { CssBox } from './css-box';

/** A Monaco that is only what the box asks of it: a model with a text, an editor, and the theme calls. */
function fakeMonaco() {
  const seen = { language: '', value: '', theme: '', disposed: 0 };
  let listener: (() => void) | undefined;
  const model = {
    getValue: () => seen.value,
    getFullModelRange: () => ({}),
    pushEditOperations: (_s: unknown, ops: { text: string }[]) => void (seen.value = ops[0].text),
    onDidChangeContent: (cb: () => void) => void (listener = cb),
    dispose: () => void seen.disposed++,
  };
  const editor = { dispose: () => void seen.disposed++, updateOptions: () => undefined };
  const api = {
    editor: {
      createModel: (value: string, language: string) => ((seen.value = value), (seen.language = language), model),
      create: () => editor,
      defineTheme: () => undefined,
      setTheme: (name: string) => void (seen.theme = name),
    },
  } as unknown as MonacoApi;
  return { api, seen, type: (text: string) => ((seen.value = text), listener?.()) };
}

async function create(load: () => Promise<MonacoApi>, text = 'a { color: red }') {
  stubStorage({ 'motion-edit.lang': 'en' });
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang: 'en' } }, { provide: MONACO, useValue: load }] });
  const fixture = TestBed.createComponent(CssBox);
  fixture.componentRef.setInput('text', text);
  const typed: string[] = [];
  fixture.componentInstance.textChange.subscribe((t) => typed.push(t));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, typed, q: (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`) };
}

describe('CssBox', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a text box that becomes Monaco in CSS mode once it has loaded, with the text it had', async () => {
    const m = fakeMonaco();
    const { q, typed, fixture } = await create(() => Promise.resolve(m.api));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q('theme-css-monaco')!.hidden).toBe(false);
    });
    expect(q('theme-css')!.hidden).toBe(true);
    expect(m.seen.language).toBe('css');
    expect(m.seen.value).toBe('a { color: red }');
    expect(m.seen.theme).toBe('motion');
    m.type('b { color: blue }');
    expect(typed).toEqual(['b { color: blue }']);
  });

  it('takes the text the page gives it into the editor without reporting it as an edit', async () => {
    const m = fakeMonaco();
    const { q, typed, fixture } = await create(() => Promise.resolve(m.api));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q('theme-css-monaco')!.hidden).toBe(false);
    });
    fixture.componentRef.setInput('text', 'c { top: 0 }');
    fixture.detectChanges();
    expect(m.seen.value).toBe('c { top: 0 }');
    expect(typed).toEqual([]);
  });

  it('stays a text box that works when Monaco cannot be loaded', async () => {
    const { q, typed, fixture } = await create(() => Promise.reject(new Error('offline')));
    const box = q('theme-css') as HTMLTextAreaElement;
    expect(box.hidden).toBe(false);
    expect(q('theme-css-monaco')!.hidden).toBe(true);
    box.value = 'x{}';
    box.dispatchEvent(new Event('input'));
    expect(typed).toEqual(['x{}']);
    fixture.detectChanges();
  });

  it('shows the count, turns it red over the limit, and says the server\'s reason', async () => {
    const { q, fixture } = await create(() => Promise.reject(new Error('x')), 'x'.repeat(20481));
    expect(q('theme-css-count')!.classList.contains('over')).toBe(true);
    expect(q('theme-css-count')!.textContent).toContain('20481 of 20480');
    expect(q('theme-css-problem')).toBeNull();
    fixture.componentRef.setInput('problem', 'design.theme.css: @import is not allowed');
    fixture.detectChanges();
    expect(q('theme-css-problem')!.textContent).toContain('The server refuses it: design.theme.css: @import is not allowed');
    expect(q('theme-css')!.getAttribute('aria-invalid')).toBe('true');
  });
});
