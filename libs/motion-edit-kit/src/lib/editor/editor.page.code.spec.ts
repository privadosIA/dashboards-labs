import { provideHttpClient } from '@angular/common/http';
import { MOTION_EDIT_OPTIONS } from '../core/options';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionEditor } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';

import { fakeMonaco } from '../../testing/fake-monaco';
import { stubStorage } from '../../testing/memory-storage';
import { AUDIO_FACTORY } from './audio';
import { CODE_DEBOUNCE_MS } from './code/code-sync';
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

async function setup(lang: 'es' | 'en' = 'en') {
  stubStorage({ 'motion-edit.lang': lang });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10 });
  await firstValueFrom(port.loadSample());
  const monaco = fakeMonaco();
  TestBed.configureTestingModule({
    providers: [
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang } },
      provideRouter([]),
      provideHttpClient(),
      provideServerConnection({ lang }),
      provideLabForms({ lang }),
      provideMotionParts({ lang }),
      provideMotionEditor({ lang }),
      { provide: ANIMATION, useValue: port },
      { provide: MONACO, useValue: () => Promise.resolve(monaco.api) },
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
  const page = fixture.componentInstance as unknown as {
    selection: { (): { piece: string; extra?: number } | null; set(v: { piece: string; extra?: number } | null): void };
    sync: { text(): string; sites(): readonly { id: string; range: { start: { offset: number }; end: { offset: number } } }[] };
    doc(): { script: { pieces: { id: string; mode?: string; start: number; end: number }[] } };
  };
  await settle(() => expect(el.querySelector('[data-testid="view-code"]')).not.toBeNull());
  const openCode = async () => {
    (el.querySelector('[data-testid="view-code"]') as HTMLButtonElement).click();
    await settle(() => expect(monaco.content).not.toBe(''));
  };
  const click = (testid: string) => (el.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement).click();
  /** Types in the pane and waits for the page to read it. */
  const type = async (text: string) => {
    monaco.typed(text);
    await new Promise((r) => setTimeout(r, CODE_DEBOUNCE_MS + 50));
    fixture.detectChanges();
  };
  return { fixture, el, monaco, settle, page, openCode, click, type, port };
}

describe('EditorPage, the Code tab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts on Visual, without Monaco, and shows the code only when the tab is chosen', async () => {
    const { el, monaco, openCode } = await setup();
    expect(el.querySelector('app-code-pane')).toBeNull();
    expect(monaco.content).toBe('');
    expect(el.querySelector('.grid')!.classList.contains('code-view')).toBe(false);
    await openCode();
    expect(el.querySelector('app-code-pane')).not.toBeNull();
    expect(monaco.content).toContain("import { script, piece, parts");
    expect(monaco.content).toContain('export default script([');
    expect(el.querySelector('.grid')!.classList.contains('code-view')).toBe(true);
    expect(el.querySelector('[data-testid="code-status"]')!.textContent).toContain('The code is applied to the script.');
  });

  it('turns an edit of the code into an edit of the document, as one step of the history', async () => {
    const { el, page, openCode, type, monaco, settle, click } = await setup();
    await openCode();
    expect(el.querySelector('[data-testid="dirty"]')).toBeNull();
    const before = page.doc().script.pieces[0].mode;
    const next = monaco.content.replace(/(piece\(\{\n\s+id: '[^']+',\n)/, "$1    mode: 'light',\n");
    expect(next).not.toBe(monaco.content);
    await type(next);
    await settle(() => expect(el.querySelector('[data-testid="dirty"]')).not.toBeNull());
    expect(page.doc().script.pieces[0].mode).toBe('light');
    expect(before).not.toBe('light');
    click('undo');
    await settle(() => expect(page.doc().script.pieces[0].mode).toBe(before));
    // The code follows the document back.
    await settle(() => expect(monaco.content).not.toContain("mode: 'light'"));
  });

  it('pauses the visual editing while the code has errors, keeps the document and offers to throw the code away', async () => {
    const { el, page, openCode, type, monaco, settle, click } = await setup();
    await openCode();
    const original = JSON.stringify(page.doc());
    await type(`${monaco.content}\nlet broken = 1;`);
    await settle(() => expect(el.querySelector('[data-testid="code-paused"]')).not.toBeNull());
    expect(JSON.stringify(page.doc())).toBe(original);
    expect((el.querySelector('[data-testid="split"]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('[data-testid="code-status"]')!.textContent).toContain('1 error');
    vi.stubGlobal('confirm', () => true);
    click('code-revert');
    await settle(() => expect(el.querySelector('[data-testid="code-paused"]')).toBeNull());
    expect(monaco.content).not.toContain('broken');
    expect((el.querySelector('[data-testid="split"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps the visual editing paused on the Visual tab and offers the way back to the code', async () => {
    const { el, openCode, type, monaco, settle, click } = await setup();
    await openCode();
    await type(`${monaco.content}\nlet broken = 1;`);
    click('view-visual');
    await settle(() => expect(el.querySelector('[data-testid="code-go"]')).not.toBeNull());
    expect(el.querySelector('.grid')!.classList.contains('code-view')).toBe(false);
    click('code-go');
    await settle(() => expect(el.querySelector('.grid')!.classList.contains('code-view')).toBe(true));
    expect(el.querySelector('[data-testid="code-go"]')).toBeNull();
  });

  it('highlights the selected piece in the code and selects the piece the cursor is in', async () => {
    const { page, openCode, monaco, settle, fixture } = await setup();
    await openCode();
    const [first, second] = page.sync.sites();
    page.selection.set({ piece: first.id });
    await settle(() => expect(monaco.calls.decorations.at(-1)).toHaveLength(1));
    monaco.moveCursor(second.range.start.offset + 5, true);
    fixture.detectChanges();
    expect(page.selection()).toEqual({ piece: second.id });
    // A cursor outside every piece selects nothing.
    monaco.moveCursor(0, true);
    fixture.detectChanges();
    expect(page.selection()).toBeNull();
  });

  it('asks before saving while the code has errors, and saves the last script that mapped when told to', async () => {
    const { el, openCode, type, monaco, settle, click, port } = await setup();
    await openCode();
    await type(monaco.content.replace(/(piece\(\{\n\s+id: '[^']+',\n)/, "$1    mode: 'light',\n"));
    await settle(() => expect(el.querySelector('[data-testid="dirty"]')).not.toBeNull());
    await type(`${monaco.content}\nlet broken = 1;`);
    await settle(() => expect(el.querySelector('[data-testid="code-paused"]')).not.toBeNull());
    const saved = vi.spyOn(port, 'saveScript');
    const ask = vi.fn(() => false);
    vi.stubGlobal('confirm', ask);
    click('save');
    expect(ask).toHaveBeenCalledWith('The code has errors. Save the last script that could be applied?');
    expect(saved).not.toHaveBeenCalled();
    ask.mockReturnValue(true);
    click('save');
    await settle(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(saved.mock.calls[0][1])).toContain('"mode":"light"');
  });

  it('writes the code again after a visual edit and tells the person once that comments were replaced', async () => {
    const { fixture, el, page, openCode, type, monaco, settle, click } = await setup();
    await openCode();
    await type(`// my note\n${monaco.content}`);
    click('view-visual');
    const first = page.doc().script.pieces[0];
    const count = page.doc().script.pieces.length;
    (fixture.componentInstance as unknown as { clock: { seek(t: number): void } }).clock.seek((first.start + first.end) / 2);
    click('split');
    await settle(() => expect(page.doc().script.pieces.length).toBe(count + 1));
    click('view-code');
    await settle(() => expect(el.querySelector('[data-testid="notice"]')?.textContent).toContain('comments and formatting you had written'));
    expect(monaco.content).not.toContain('my note');
  });

  it('leaves the keys typed in the code to the code: no split, no play, no help', async () => {
    const { fixture, el, page, openCode } = await setup();
    await openCode();
    const field = el.querySelector('.code-pane-host') as HTMLElement;
    const count = page.doc().script.pieces.length;
    const clock = (fixture.componentInstance as unknown as { clock: { playing(): boolean; seek(t: number): void } }).clock;
    clock.seek(1.5);
    for (const key of ['s', ' ', '?', 'm', 'Delete', 'Backspace', 'Home']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      field.dispatchEvent(event);
      expect(event.defaultPrevented, key).toBe(false);
    }
    fixture.detectChanges();
    expect(page.doc().script.pieces.length).toBe(count);
    expect(el.querySelector('[data-testid="notice"]')).toBeNull();
    expect(clock.playing()).toBe(false);
  });

  it('is in Spanish too', async () => {
    const { el, openCode } = await setup('es');
    expect(el.querySelector('[data-testid="view-code"]')!.textContent).toBe('Código');
    await openCode();
    expect(el.querySelector('[data-testid="code-status"]')!.textContent).toContain('El código se aplica al guion.');
  });
});
