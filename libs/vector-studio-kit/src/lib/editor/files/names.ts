import { slug, type VectorDocument } from '@lab/vector-editor';

/** What a file made from the document is called, without its ending: the document's name, or `untitled`. */
export const fileBase = (doc: Pick<VectorDocument, 'name'>): string => slug(doc.name ?? '') || 'untitled';

/** The name a part made from the document would have: the one it was opened from or sent as, else its own. */
export const partNameOf = (doc: Pick<VectorDocument, 'name' | 'partName'>): string => doc.partName ?? fileBase(doc);

/** The name of a file without the ending the editor knows (`logo.svg`, `logo.vector.json`). */
export const stem = (filename: string): string => filename.replace(/\.vector\.json$/i, '').replace(/\.(svg|json)$/i, '');
