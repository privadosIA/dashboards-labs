/// <reference path="./monaco-modules.d.ts" />
import type * as Monaco from 'monaco-editor';
import type * as Api from 'monaco-editor/editor/editor.api';

/** The editor's API as the code tab uses it: the editor and its languages, and the TypeScript service with its defaults. */
export type MonacoApi = typeof Api & { readonly typescript: typeof Monaco.typescript };

let loading: Promise<MonacoApi> | undefined;

/**
 * Loads Monaco and its TypeScript worker the first time the Code tab opens: the editor, its features and the language service are
 * dynamic imports, so they are a chunk of their own that the pieces list and the visual editor never pay for. The two workers are
 * separate files the builder emits (`new Worker(new URL(...))`); this is the one file to touch if the builder's way of doing that changes.
 */
export function loadMonaco(): Promise<MonacoApi> {
  loading ??= (async () => {
    (self as unknown as { MonacoEnvironment: Api.Environment }).MonacoEnvironment = {
      getWorker: (_id, label) =>
        label === 'typescript' || label === 'javascript'
          ? new Worker(new URL('../../../../../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' })
          : label === 'css' || label === 'scss' || label === 'less'
            ? new Worker(new URL('../../../../../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' })
            : new Worker(new URL('../../../../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' }),
    };
    // The main entry registers the features (suggest, hover, markers...) and the TypeScript service; the API is shared with it.
    const main = (await import('monaco-editor/editor/editor.main')) as { typescript: typeof Monaco.typescript };
    const api = await import('monaco-editor/editor/editor.api');
    return { ...api, typescript: main.typescript };
  })().catch((e: unknown) => {
    loading = undefined;
    throw e;
  });
  return loading;
}
