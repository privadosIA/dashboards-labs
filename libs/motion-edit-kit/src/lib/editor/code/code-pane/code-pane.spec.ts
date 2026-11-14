import { Component, signal } from '@angular/core';
import { MOTION_EDIT_OPTIONS } from '../../../core/options';
import { TestBed } from '@angular/core/testing';
import { diagnostic, SCRIPT_DECLARATIONS_PATH, type Diagnostic, type Range } from '@lab/motion-editor/code';

import { stubStorage } from '../../../../testing/memory-storage';
import type { MonacoApi } from '../monaco-loader';
import { fakeMonaco } from '../../../../testing/fake-monaco';
import { CodePane, MARKER_OWNER, MODEL_URI, MONACO } from './code-pane';

@Component({
  imports: [CodePane],
  template: `<app-code-pane [text]="text()" [declarations]="decl()" [diagnostics]="diagnostics()" [highlight]="highlight()" [readOnly]="readOnly()" (textChange)="typed.push($event)" (cursorAt)="cursors.push($event)" />`,
})
class Host {
  readonly text = signal('const a = 1;\n');
  readonly decl = signal('export declare const a: 1;');
  readonly diagnostics = signal<readonly Diagnostic[]>([]);
  readonly highlight = signal<Range | null>(null);
  readonly readOnly = signal(false);
  readonly typed: string[] = [];
  readonly cursors: number[] = [];
}

const range = (line: number, column: number, endLine: number, endColumn: number): Range => ({ start: { offset: 0, line, column }, end: { offset: 1, line: endLine, column: endColumn } });

async function setup(load?: () => Promise<MonacoApi>, lang: 'es' | 'en' = 'en') {
  stubStorage({ 'motion-edit.lang': lang });
  const monaco = fakeMonaco();
  TestBed.configureTestingModule({ providers: [{ provide: MOTION_EDIT_OPTIONS, useValue: { lang } }, { provide: MONACO, useValue: load ?? (() => Promise.resolve(monaco.api)) }] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, monaco, el: fixture.nativeElement as HTMLElement };
}

describe('CodePane', () => {
  it('opens a TypeScript model with the text and gives TypeScript the declarations', async () => {
    const { monaco, el } = await setup();
    expect(monaco.content).toBe('const a = 1;\n');
    expect(monaco.calls.libs.map((l) => [l.content, l.path])).toEqual([['export declare const a: 1;', SCRIPT_DECLARATIONS_PATH]]);
    expect(monaco.calls.themes).toEqual(['define:motion', 'set:motion']);
    expect(el.querySelector('[data-testid="code-loading"]')).toBeNull();
    const created = monaco.calls.options.find((o) => 'ariaLabel' in o)!;
    expect(created['ariaLabel']).toBe('Script code');
    expect(created['automaticLayout']).toBe(true);
  });

  it('configures TypeScript strictly, without emitting', async () => {
    const { monaco } = await setup();
    const compiler = monaco.calls.options.find((o) => 'compiler' in o)!['compiler'] as Record<string, unknown>;
    expect(compiler).toMatchObject({ strict: true, noEmit: true, target: 99, module: 99, moduleResolution: 2 });
  });

  it('replaces the declarations when the catalog changes, disposing the old ones', async () => {
    const { fixture, host, monaco } = await setup();
    host.decl.set('export declare const b: 2;');
    fixture.detectChanges();
    expect(monaco.calls.libs.map((l) => [l.content, l.disposed])).toEqual([['export declare const a: 1;', true], ['export declare const b: 2;', false]]);
  });

  it('takes a new text into the model without echoing it as the person typing', async () => {
    const { fixture, host, monaco } = await setup();
    host.text.set('const b = 2;\n');
    fixture.detectChanges();
    expect(monaco.content).toBe('const b = 2;\n');
    expect(host.typed).toEqual([]);
  });

  it('says what the person typed', async () => {
    const { host, monaco } = await setup();
    monaco.typed('const c = 3;\n');
    expect(host.typed).toEqual(['const c = 3;\n']);
  });

  it('draws the mapper diagnostics as markers in the language of the page', async () => {
    const d: Diagnostic = diagnostic('error', 'param-max', { param: 'count', limit: 5 }, range(3, 12, 3, 13));
    const { fixture, host, monaco } = await setup();
    host.diagnostics.set([d, diagnostic('warning', 'beat-fraction', {}, range(4, 2, 4, 2))]);
    fixture.detectChanges();
    const last = monaco.calls.markers.at(-1)!;
    expect(last.owner).toBe(MARKER_OWNER);
    expect(last.markers).toEqual([
      { severity: 8, message: '"count" must be at most 5.', startLineNumber: 3, startColumn: 12, endLineNumber: 3, endColumn: 13 },
      { severity: 4, message: 'The part of the beat must be at least 0 and less than 1.', startLineNumber: 4, startColumn: 2, endLineNumber: 4, endColumn: 3 },
    ]);
  });

  it('writes the markers in Spanish when the page is', async () => {
    const { fixture, host, monaco } = await setup(undefined, 'es');
    host.diagnostics.set([diagnostic('error', 'param-max', { param: 'count', limit: 5 }, range(1, 1, 1, 2))]);
    fixture.detectChanges();
    expect(monaco.calls.markers.at(-1)!.markers[0].message).toBe('«count» debe ser como mucho 5.');
  });

  it('highlights the selected piece and clears it, scrolling only when the person is not in the code', async () => {
    const { fixture, host, monaco } = await setup();
    host.highlight.set(range(2, 3, 9, 5));
    fixture.detectChanges();
    expect(monaco.calls.decorations.at(-1)).toHaveLength(1);
    expect(monaco.calls.reveals).toHaveLength(1);
    monaco.setFocus(true);
    host.highlight.set(range(10, 1, 12, 2));
    fixture.detectChanges();
    expect(monaco.calls.reveals).toHaveLength(1);
    host.highlight.set(null);
    fixture.detectChanges();
    expect(monaco.calls.decorations.at(-1)).toEqual([]);
  });

  it('reports the cursor only when the person moved it', async () => {
    const { host, monaco } = await setup();
    monaco.moveCursor(42, true);
    monaco.moveCursor(50, false);
    expect(host.cursors).toEqual([42]);
  });

  it('follows read-only', async () => {
    const { fixture, host, monaco } = await setup();
    host.readOnly.set(true);
    fixture.detectChanges();
    expect(monaco.calls.options.at(-1)).toEqual({ readOnly: true });
  });

  it('says so and offers to try again when the editor cannot be loaded', async () => {
    let attempts = 0;
    const monaco = fakeMonaco();
    const { fixture, el } = await setup(() => (++attempts === 1 ? Promise.reject(new Error('chunk lost')) : Promise.resolve(monaco.api)));
    expect(el.querySelector('[data-testid="code-failed"]')?.textContent).toContain('The code editor could not be opened: chunk lost');
    (el.querySelector('.code-pane-retry') as HTMLButtonElement).click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="code-failed"]')).toBeNull();
    expect(monaco.content).toBe('const a = 1;\n');
  });
});
