import type { MonacoApi } from '../lib/editor/code/monaco-loader';

/** A Monaco that records what the pane asks of it: no worker, no canvas, no layout. */
export function fakeMonaco() {
  const calls: { markers: { owner: string; markers: { severity: number; message: string; startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }[] }[]; libs: { content: string; path?: string; disposed: boolean }[]; themes: string[]; decorations: unknown[][]; options: Record<string, unknown>[]; reveals: unknown[] } = {
    markers: [],
    libs: [],
    themes: [],
    decorations: [],
    options: [],
    reveals: [],
  };
  let content = '';
  let onContent: () => void = () => undefined;
  let onCursor: (e: { position: { offset: number } }) => void = () => undefined;
  let focused = false;
  const model = {
    getValue: () => content,
    getFullModelRange: () => ({ full: true }),
    pushEditOperations: (_sel: unknown, ops: { text: string }[]) => {
      content = ops[0].text;
      onContent();
      return null;
    },
    onDidChangeContent: (fn: () => void) => void (onContent = fn),
    getOffsetAt: (p: { offset: number }) => p.offset,
    dispose: () => undefined,
  };
  const editor = {
    createDecorationsCollection: () => ({ set: (d: unknown[]) => calls.decorations.push(d), clear: () => calls.decorations.push([]) }),
    onDidChangeCursorPosition: (fn: typeof onCursor) => void (onCursor = fn),
    hasTextFocus: () => focused,
    updateOptions: (o: Record<string, unknown>) => calls.options.push(o),
    revealRangeInCenterIfOutsideViewport: (r: unknown) => calls.reveals.push(r),
    focus: () => undefined,
    dispose: () => undefined,
  };
  const api = {
    Uri: { parse: (s: string) => ({ uri: s }) },
    Range: class {
      constructor(
        public a: number,
        public b: number,
        public c: number,
        public d: number,
      ) {}
    },
    MarkerSeverity: { Error: 8, Warning: 4 },
    editor: {
      getModel: () => null,
      createModel: (text: string, language: string, uri?: { uri: string }) => {
        // The theme's CSS box: a model of its own, apart from the script's (sharing it would overwrite the script and its change handler).
        if (language === 'css') return { getValue: () => text, onDidChangeContent: () => undefined, dispose: () => undefined };
        content = text;
        expect(language).toBe('typescript');
        expect(uri?.uri).toBe('file:///script.ts');
        return model;
      },
      create: (_el: HTMLElement, options: Record<string, unknown>) => {
        calls.options.push(options);
        return editor;
      },
      setModelMarkers: (_m: unknown, owner: string, markers: never[]) => calls.markers.push({ owner, markers }),
      defineTheme: (name: string) => calls.themes.push(`define:${name}`),
      setTheme: (name: string) => calls.themes.push(`set:${name}`),
    },
    typescript: {
      ScriptTarget: { ESNext: 99 },
      ModuleResolutionKind: { NodeJs: 2 },
      typescriptDefaults: {
        setCompilerOptions: (o: Record<string, unknown>) => calls.options.push({ compiler: o }),
        setEagerModelSync: () => undefined,
        setDiagnosticsOptions: () => undefined,
        addExtraLib: (content2: string, path?: string) => {
          const lib = { content: content2, path, disposed: false };
          calls.libs.push(lib);
          return { dispose: () => void (lib.disposed = true) };
        },
      },
    },
  };
  return {
    api: api as unknown as MonacoApi,
    calls,
    typed: (text: string) => {
      content = text;
      onContent();
    },
    moveCursor: (offset: number, hasFocus = true) => {
      focused = hasFocus;
      onCursor({ position: { offset } });
    },
    setFocus: (v: boolean) => void (focused = v),
    get content() {
      return content;
    },
  };
}

