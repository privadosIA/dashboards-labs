import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewEncapsulation, afterNextRender, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { THEME_CSS_MAX } from '@lab/animation-core';
import type { editor as MonacoEditor } from 'monaco-editor/editor/editor.api';

import { LanguageService } from '../../../../core/language';
import { MONACO } from '../../../code/code-pane/code-pane';
import type { MonacoApi } from '../../../code/monaco-loader';
import { themeFrom } from '../../../code/monaco-theme';
import { sceneTextsFor } from '../../../scenes/texts';

/**
 * The theme's stylesheet. It is a plain text box from the first moment and becomes Monaco in CSS mode when the editor has loaded (a chunk of its own, loaded only when a design with a theme
 * is open); if Monaco cannot be loaded the text box stays, so the stylesheet can always be written. The server's reason for refusing it is shown right here.
 */
@Component({
  selector: 'app-css-box',
  templateUrl: './css-box.html',
  styleUrl: './css-box.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class CssBox implements OnDestroy {
  private readonly load = inject(MONACO);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = sceneTextsFor(this.lang).theme;
  protected readonly max = THEME_CSS_MAX;

  readonly text = input('');
  readonly readOnly = input(false);
  /** The server's reason for refusing the stylesheet. */
  readonly problem = input('');
  readonly textChange = output<string>();

  /** `plain`: the text box; `monaco`: the editor has taken its place. */
  protected readonly mode = signal<'plain' | 'monaco'>('plain');
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private live: { readonly monaco: MonacoApi; readonly editor: MonacoEditor.IStandaloneCodeEditor; readonly model: MonacoEditor.ITextModel; applying: boolean } | null = null;
  private destroyed = false;
  private observer: MutationObserver | undefined;

  constructor() {
    afterNextRender(() => void this.start());
    effect(() => {
      const text = this.text();
      untracked(() => {
        const live = this.live;
        if (!live || live.model.getValue() === text) return;
        live.applying = true;
        try {
          live.model.pushEditOperations([], [{ range: live.model.getFullModelRange(), text }], () => null);
        } finally {
          live.applying = false;
        }
      });
    });
    effect(() => {
      const readOnly = this.readOnly();
      untracked(() => this.live?.editor.updateOptions({ readOnly }));
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.live?.editor.dispose();
    this.live?.model.dispose();
  }

  protected type(event: Event): void {
    this.textChange.emit((event.target as HTMLTextAreaElement).value);
  }

  private async start(): Promise<void> {
    let monaco: MonacoApi;
    try {
      monaco = await this.load();
    } catch {
      return; // the text box stays
    }
    if (this.destroyed) return;
    const element = this.host().nativeElement;
    const model = monaco.editor.createModel(this.text(), 'css');
    const font = getComputedStyle(element).getPropertyValue('--lab-font-mono').trim();
    const editor = monaco.editor.create(element, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'off',
      folding: false,
      tabSize: 2,
      fontSize: 13,
      ...(font ? { fontFamily: font } : {}),
      readOnly: this.readOnly(),
      ariaLabel: this.t.css,
      fixedOverflowWidgets: true,
      theme: 'vs-dark',
    });
    const live = { monaco, editor, model, applying: false };
    model.onDidChangeContent(() => {
      if (!live.applying) this.textChange.emit(model.getValue());
    });
    this.live = live;
    this.applyTheme();
    this.observer = new MutationObserver(() => this.applyTheme());
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    this.mode.set('monaco');
  }

  /** The editor's colours are the page's tokens as they are now. */
  private applyTheme(): void {
    const monaco = this.live?.monaco;
    if (!monaco) return;
    const style = getComputedStyle(document.documentElement);
    monaco.editor.defineTheme('motion', themeFrom((name) => style.getPropertyValue(name).trim()));
    monaco.editor.setTheme('motion');
  }
}
