import { allIds, fromJson, importSvg, newDocument, VectorModelError, type ImportReport, type VectorDocument } from '@lab/vector-editor';

import { stem } from './names';

export type OpenMode = 'new' | 'add';

export type Opened = { doc: VectorDocument; report?: ImportReport; kind: 'svg' | 'json' } | { problem: string };

/** What a file is to the editor: a `.vector.json` document, an `.svg` to import, or nothing it knows. */
export const kindOf = (filename: string): 'json' | 'svg' | undefined =>
  /\.vector\.json$/i.test(filename) || /\.json$/i.test(filename) ? 'json' : /\.svg$/i.test(filename) ? 'svg' : undefined;

/**
 * Makes the document a file gives: a `.vector.json` is loaded as it is; an `.svg` becomes a new document (named after the file) or, with `add`, a
 * node added at the end of the current one: its ids namespaced by the import so they repeat none the document has, and placed at the centre of
 * the artboard at half its size (the person moves and scales it from there).
 */
export function openText(filename: string, text: string, current: VectorDocument, mode: OpenMode): Opened {
  const kind = kindOf(filename);
  if (kind === 'json') {
    try {
      const doc = fromJson(text);
      return { kind, doc: doc.name ? doc : { ...doc, name: stem(filename) } };
    } catch (e) {
      if (e instanceof VectorModelError) return { problem: e.message };
      throw e;
    }
  }
  if (kind !== 'svg') return { problem: filename };
  if (mode === 'add') {
    const imported = importSvg(text, { taken: allIds(current.nodes), addTo: current.viewBox });
    if ('problem' in imported) return imported;
    return { kind, doc: { ...current, nodes: [...current.nodes, imported.node] }, report: imported.report };
  }
  const imported = importSvg(text);
  if ('problem' in imported) return imported;
  return { kind, doc: newDocument({ name: stem(filename), viewBox: imported.viewBox, nodes: [imported.node] }), report: imported.report };
}
