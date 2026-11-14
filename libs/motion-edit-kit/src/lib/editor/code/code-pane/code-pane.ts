import { ChangeDetectionStrategy, Component, ElementRef, InjectionToken, OnDestroy, ViewEncapsulation, afterNextRender, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { SCRIPT_DECLARATIONS_PATH, diagnosticText, type Diagnostic, type Range } from '@lab/motion-editor/code';
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor/editor/editor.api';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import type { MonacoApi } from '../monaco-loader';
import { themeFrom } from '../monaco-theme';

/**
 * How Monaco is got. The loader file is only reached from here, through a dynamic import, so the editor and its TypeScript service are a
 * chunk of their own that is paid for when the Code tab opens. A test provides a stub so no worker is needed.
 */
export const MONACO = new InjectionToken<() => Promise<MonacoApi>>('MONACO', {
  providedIn: 'root',
  factory: () => () => import('../monaco-loader').then((m) => m.loadMonaco()),
});

/** The URI of the model: the declarations of `@motion/script` live next to it and are found from there. */
export const MODEL_URI = 'file:///script.ts';
/** The owner of the mapper's markers, beside the TypeScript service's own. */
export const MARKER_OWNER = 'motion';

interface Live {
  readonly monaco: MonacoApi;
  readonly editor: MonacoEditor.IStandaloneCodeEditor;
  readonly model: MonacoEditor.ITextModel;
  readonly selected: MonacoEditor.IEditorDecorationsCollection;
  extraLib: IDisposable | undefined;
  /** The text is being replaced by the page, not typed: what the model reports is not an edit of the person's. */
  applying: boolean;
}

/**
 * The code of the script in Monaco, with TypeScript's service fed the declarations generated from the catalog and the song. It is a view:
 * the text comes in as an input and what is typed goes out as an event; the mapper's diagnostics are drawn as markers beside TypeScript's;
 * the piece selected on the timeline is highlighted and the cursor says which piece it is in.
 */
@Component({
  selector: 'app-code-pane',
  templateUrl: './code-pane.html',
  styleUrl: './code-pane.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class CodePane implements OnDestroy {
  private readonly load = inject(MONACO);
  private readonly lang = inject(LanguageService).lang;
  protected readonly t = textsFor(this.lang).code.pane;

  readonly text = input.required<string>();
  readonly declarations = input.required<string>();
  readonly diagnostics = input<readonly Diagnostic[]>([]);
  /** The range of the selected piece, highlighted; `null` when nothing is selected. */
  readonly highlight = input<Range | null>(null);
  readonly readOnly = input(false);
  /** The person typed: the whole text now. */
  readonly textChange = output<string>();
  /** The cursor moved to this offset by the person's hand. */
  readonly cursorAt = output<number>();

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly failure = signal('');
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly live = signal<Live | null>(null);
  private observer: MutationObserver | undefined;
  private media: MediaQueryList | undefined;
  private readonly onMedia = (): void => this.applyTheme();
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());

    effect(() => {
      const live = this.live();
      const text = this.text();
      if (!live) return;
      untracked(() => {
        if (live.model.getValue() === text) return;
        live.applying = true;
        try {
          // An edit, not a new value, so that Monaco's own undo still reaches back through it.
          live.model.pushEditOperations([], [{ range: live.model.getFullModelRange(), text }], () => null);
        } finally {
          live.applying = false;
        }
      });
    });

    effect(() => {
      const live = this.live();
      const declarations = this.declarations();
      if (!live) return;
      untracked(() => {
        live.extraLib?.dispose();
        live.extraLib = live.monaco.typescript.typescriptDefaults.addExtraLib(declarations, SCRIPT_DECLARATIONS_PATH);
      });
    });

    effect(() => {
      const live = this.live();
      const diagnostics = this.diagnostics();
      if (!live) return;
      untracked(() => {
        const { MarkerSeverity } = live.monaco;
        live.monaco.editor.setModelMarkers(
          live.model,
          MARKER_OWNER,
          diagnostics.map((d) => ({
            severity: d.severity === 'error' ? MarkerSeverity.Error : MarkerSeverity.Warning,
            message: diagnosticText(d, this.lang),
            startLineNumber: d.line,
            startColumn: d.column,
            endLineNumber: d.endLine,
            endColumn: d.endLine === d.line && d.endColumn <= d.column ? d.column + 1 : d.endColumn,
          })),
        );
      });
    });

    effect(() => {
      const live = this.live();
      const range = this.highlight();
      if (!live) return;
      untracked(() => {
        if (!range) {
          live.selected.clear();
          return;
        }
        const r = new live.monaco.Range(range.start.line, range.start.column, range.end.line, range.end.column);
        live.selected.set([{ range: r, options: { className: 'code-pane-selected', isWholeLine: false } }]);
        // Only scroll to it when the person is not in the code: they are looking at the timeline.
        if (!live.editor.hasTextFocus()) live.editor.revealRangeInCenterIfOutsideViewport(r);
      });
    });

    effect(() => {
      const live = this.live();
      const readOnly = this.readOnly();
      if (live) untracked(() => live.editor.updateOptions({ readOnly }));
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.media?.removeEventListener('change', this.onMedia);
    const live = this.live();
    if (!live) return;
    live.extraLib?.dispose();
    live.monaco.editor.setModelMarkers(live.model, MARKER_OWNER, []);
    live.editor.dispose();
    live.model.dispose();
  }

  /** Puts the cursor in the code. */
  focus(): void {
    this.live()?.editor.focus();
  }

  protected retry(): void {
    this.state.set('loading');
    void this.start();
  }

  private async start(): Promise<void> {
    let monaco: MonacoApi;
    try {
      monaco = await this.load();
    } catch (e) {
      if (this.destroyed) return;
      this.failure.set(e instanceof Error ? e.message : String(e));
      this.state.set('failed');
      return;
    }
    if (this.destroyed) return;
    const { typescript } = monaco;
    const defaults = typescript.typescriptDefaults;
    defaults.setCompilerOptions({
      strict: true,
      noEmit: true,
      allowNonTsExtensions: true,
      target: typescript.ScriptTarget.ESNext,
      module: 99, // ModuleKind.ESNext
      moduleResolution: typescript.ModuleResolutionKind.NodeJs,
      lib: ['esnext'],
    });
    defaults.setEagerModelSync(true);
    defaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
    const uri = monaco.Uri.parse(MODEL_URI);
    monaco.editor.getModel(uri)?.dispose();
    const model = monaco.editor.createModel(this.text(), 'typescript', uri);
    const element = this.host().nativeElement;
    const font = getComputedStyle(element).getPropertyValue('--lab-font-mono').trim();
    const editor = monaco.editor.create(element, {
      model,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      insertSpaces: true,
      fontSize: 13,
      ...(font ? { fontFamily: font } : {}),
      lineNumbersMinChars: 3,
      renderWhitespace: 'none',
      readOnly: this.readOnly(),
      ariaLabel: this.t.label,
      fixedOverflowWidgets: true,
      theme: 'vs-dark',
    });
    const live: Live = { monaco, editor, model, selected: editor.createDecorationsCollection(), extraLib: undefined, applying: false };
    model.onDidChangeContent(() => {
      if (!live.applying) this.textChange.emit(model.getValue());
    });
    editor.onDidChangeCursorPosition((e) => {
      if (editor.hasTextFocus()) this.cursorAt.emit(model.getOffsetAt(e.position));
    });
    this.applyTheme(monaco);
    this.watchTheme();
    this.live.set(live);
    this.state.set('ready');
  }

  /** Defines the editor's theme from the page's tokens as they are now and uses it. */
  private applyTheme(monaco: MonacoApi | undefined = this.live()?.monaco): void {
    if (!monaco) return;
    const style = getComputedStyle(document.documentElement);
    monaco.editor.defineTheme('motion', themeFrom((name) => style.getPropertyValue(name).trim()));
    monaco.editor.setTheme('motion');
  }

  /** The theme is read again when the page switches between light and dark, by the switch or by the system. */
  private watchTheme(): void {
    this.observer = new MutationObserver(() => this.applyTheme());
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    this.media = window.matchMedia?.('(prefers-color-scheme: dark)');
    this.media?.addEventListener('change', this.onMedia);
  }
}
