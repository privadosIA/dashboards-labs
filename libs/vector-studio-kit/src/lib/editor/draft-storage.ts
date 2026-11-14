import type { VectorDocument } from '@lab/vector-editor';

/** The part of `Storage` a draft needs, so a test can give it a plain object. */
export interface DraftBox {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The document in progress, kept in the browser, and when. */
export interface Draft {
  readonly doc: VectorDocument;
  readonly at: number;
}

export const DRAFT_KEY = 'vector-studio.draft';
/** A draft over this many characters is not kept: the browser's storage is small and the files are the real storage. */
export const MAX_DRAFT_CHARS = 4 * 1024 * 1024;
/** How long after a change the draft is written. */
export const DRAFT_DELAY_MS = 1000;

const box = (): DraftBox | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export type WriteResult = 'kept' | 'too-big' | 'refused';

/** Keeps the draft. Says why not when it was not: the draft is a convenience, never a reason to fail. */
export function writeDraft(draft: Draft, where: DraftBox | null = box()): WriteResult {
  const text = JSON.stringify(draft);
  if (text.length > MAX_DRAFT_CHARS) return 'too-big';
  try {
    if (!where) return 'refused';
    where.setItem(DRAFT_KEY, text);
    return 'kept';
  } catch {
    return 'refused';
  }
}

/** The draft kept, or null when there is none or what is there is not one. */
export function readDraft(where: DraftBox | null = box()): Draft | null {
  try {
    const raw = where?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    const doc = d.doc as Partial<VectorDocument> | undefined;
    return doc && doc.version === 1 && Array.isArray(doc.nodes) && typeof d.at === 'number' ? (d as Draft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(where: DraftBox | null = box()): void {
  try {
    where?.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}
