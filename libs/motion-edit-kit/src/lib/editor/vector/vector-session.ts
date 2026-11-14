import { computed, signal } from '@angular/core';
import type { PartText } from '@lab/animation-core';
import { fromPart, importSvg, newDocument, VectorStore, type VectorDocument } from '@lab/vector-editor';

/** The document a vector part carries, or why it has none (not a vector part, a model that cannot be opened). */
export function documentOfPart(text: Pick<PartText, 'name' | 'manifest' | 'fragment'>): { doc: VectorDocument } | { problem: string } {
  const read = fromPart({ manifest: text.manifest, fragment: text.fragment });
  if (!('doc' in read)) return read;
  // The dialog starts its description from the document's name: for a part of the catalog that is what the part says it does.
  let description = '';
  try {
    description = String((JSON.parse(text.manifest) as { description?: unknown }).description ?? '');
  } catch {
    // A manifest that is not JSON says nothing; the part's name stands in.
  }
  return { doc: { ...read.doc, name: description || read.doc.name || text.name, partName: text.name } };
}

/** The name of a file without its ending. */
export const stem = (file: string): string => file.replace(/\.[^.]+$/, '');

/** A new document from the text of an SVG file, named after the file, or what is wrong with it. */
export function documentOfSvg(file: string, text: string): { doc: VectorDocument } | { problem: string } {
  const imported = importSvg(text);
  if ('problem' in imported) return imported;
  return { doc: newDocument({ name: stem(file), viewBox: imported.viewBox, nodes: [imported.node] }) };
}

/**
 * The vector part being edited in the Vector tab: its store (with its own history and its own dirty state, apart from the script's), the part it
 * came from (none for a new one) and what to go back to. It is made the first time a part is opened and kept after that, so the tab keeps its work
 * while the person looks at the Visual view.
 */
export class VectorSession {
  readonly store = signal<VectorStore | null>(null);
  /** The part of the catalog the document is, or `null` for a new one that was never sent. */
  readonly partName = signal<string | null>(null);
  readonly dirty = computed(() => this.store()?.dirty() ?? false);
  readonly open = computed(() => this.store() !== null);

  /** Opens a part's document (replacing whatever was there: the caller asked about unsaved changes first). */
  openPart(doc: VectorDocument): void {
    this.make(doc);
    this.partName.set(doc.partName ?? null);
  }

  /** Opens a document that is not in the catalog yet; it counts as work not yet kept. */
  openNew(doc: VectorDocument): void {
    this.make(newDocument());
    this.store()!.adopt(doc);
    this.partName.set(null);
  }

  /** The part was sent: the document is what the catalog has now, and from here on saving replaces that part. */
  saved(name: string): void {
    const store = this.store();
    if (!store) return;
    // Not an edit of the person's: no step of the history (undo must not take the part's name away).
    const doc = { ...store.doc(), partName: name };
    store.doc.set(doc);
    store.saved.set(doc);
    this.partName.set(name);
  }

  /** Back to what was saved (a new document that was never sent has nothing to go back to: it is closed). */
  discard(): void {
    const store = this.store();
    if (!store) return;
    if (this.partName()) store.load(store.saved());
    else this.close();
  }

  close(): void {
    this.store.set(null);
    this.partName.set(null);
  }

  private make(doc: VectorDocument): void {
    this.store.set(new VectorStore(doc));
  }
}
