import type { Doc } from './editor-store';

/** The part of `Storage` a draft needs, so a test can give it a plain object. */
export interface DraftBox {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An unsaved document kept in the browser: what was being edited, when, and the saved document it started from. */
export interface Draft {
  readonly doc: Doc;
  readonly base: Doc;
  readonly at: number;
}

const key = (pieceId: string): string => `motion-edit:draft:${pieceId}`;

const box = (): DraftBox | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Keeps the draft of a piece. Returns false when the browser would not (full or blocked storage): the draft is a convenience, never a reason to fail. */
export function writeDraft(pieceId: string, draft: Draft, where: DraftBox | null = box()): boolean {
  try {
    where?.setItem(key(pieceId), JSON.stringify(draft));
    return where !== null;
  } catch {
    return false;
  }
}

/** The draft kept for a piece, or null when there is none or what is there is not a draft. */
export function readDraft(pieceId: string, where: DraftBox | null = box()): Draft | null {
  try {
    const raw = where?.getItem(key(pieceId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    const ok = (x: Partial<Doc> | undefined): boolean => !!x && typeof x === 'object' && !!x.design && Array.isArray(x.script?.pieces);
    return ok(d.doc) && ok(d.base) && typeof d.at === 'number' ? (d as Draft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(pieceId: string, where: DraftBox | null = box()): void {
  try {
    where?.removeItem(key(pieceId));
  } catch {
    // nothing to clear
  }
}

/** Whether a draft is worth offering: it differs from the server's document, whatever the server has now. */
export function worthOffering(draft: Draft, server: Doc): boolean {
  return JSON.stringify(draft.doc) !== JSON.stringify(server);
}

/** What a draft would change in the server's document, and whether the server moved on after the draft was started. */
export interface DraftSummary {
  /** Pieces that differ: changed, added or removed. */
  readonly pieces: number;
  readonly design: boolean;
  readonly layers: boolean;
  /** The server's document is no longer the one the draft started from: restoring the draft and saving would overwrite what changed there. */
  readonly serverMoved: boolean;
}

const json = (x: unknown): string => JSON.stringify(x ?? null);

export function summarizeDraft(draft: Draft, server: Doc): DraftSummary {
  const mine = new Map(draft.doc.script.pieces.map((p) => [p.id, json(p)]));
  const theirs = new Map(server.script.pieces.map((p) => [p.id, json(p)]));
  const ids = new Set([...mine.keys(), ...theirs.keys()]);
  return {
    pieces: [...ids].filter((id) => mine.get(id) !== theirs.get(id)).length,
    design: json(draft.doc.design) !== json(server.design),
    layers: json(draft.doc.script.layers) !== json(server.script.layers),
    serverMoved: json(draft.base) !== json(server),
  };
}
