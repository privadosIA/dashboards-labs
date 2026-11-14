import { computed, signal } from '@angular/core';

import type { Design, Script } from '@lab/animation-core';

/** What is being edited: the song's design and the script. */
export interface Doc {
  readonly design: Design;
  readonly script: Script;
}

/** Edits of the same kind (the same label) closer than this to each other are one step of the history: typing in one field. */
export const COALESCE_MS = 500;
const MAX_HISTORY = 200;

const same = (a: Doc, b: Doc): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * The document being edited, with what the server has (`saved`), a history to undo and redo, and whether they differ (`dirty`). Documents
 * are immutable and share what an edit did not touch, so the history just keeps them. A drag or a burst of typing is one step.
 */
export class EditorStore {
  readonly saved = signal<Doc>({} as Doc);
  readonly doc = signal<Doc>({} as Doc);
  readonly past = signal<readonly Doc[]>([]);
  readonly future = signal<readonly Doc[]>([]);
  readonly dirty = computed(() => !same(this.doc(), this.saved()));
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);

  private lastLabel: string | undefined;
  private lastAt = 0;
  private gesture = false;

  constructor(initial: Doc, private readonly now: () => number = () => Date.now()) {
    this.saved.set(initial);
    this.doc.set(initial);
  }

  /** Changes the document with `fn`. With a `label`, edits of the same label within `COALESCE_MS` make one step. A change that changes nothing is not a step. */
  apply(fn: (doc: Doc) => Doc, label?: string): void {
    const before = this.doc();
    const next = fn(before);
    if (next === before || same(next, before)) return;
    const t = this.now();
    const joins = label !== undefined && label === this.lastLabel && t - this.lastAt < COALESCE_MS && this.past().length > 0;
    if (!joins && !this.gesture) this.past.update((p) => [...p.slice(-(MAX_HISTORY - 1)), before]);
    this.future.set([]);
    this.doc.set(next);
    this.lastLabel = label;
    this.lastAt = t;
  }

  /** Starts a gesture (a drag): everything until `end` is one step, however many times `update` is called. */
  begin(): void {
    if (this.gesture) return;
    this.past.update((p) => [...p.slice(-(MAX_HISTORY - 1)), this.doc()]);
    this.future.set([]);
    this.gesture = true;
    this.lastLabel = undefined;
  }

  update(fn: (doc: Doc) => Doc): void {
    if (this.gesture) this.doc.set(fn(this.doc()));
  }

  /** Ends the gesture; one that ended where it began leaves no step. */
  end(): void {
    if (!this.gesture) return;
    this.gesture = false;
    const past = this.past();
    if (past.length > 0 && same(past[past.length - 1], this.doc())) this.past.set(past.slice(0, -1));
  }

  undo(): void {
    const past = this.past();
    if (past.length === 0) return;
    this.future.update((f) => [this.doc(), ...f]);
    this.doc.set(past[past.length - 1]);
    this.past.set(past.slice(0, -1));
    this.lastLabel = undefined;
  }

  redo(): void {
    const future = this.future();
    if (future.length === 0) return;
    this.past.update((p) => [...p, this.doc()]);
    this.doc.set(future[0]);
    this.future.set(future.slice(1));
    this.lastLabel = undefined;
  }

  /** The server has this now (after a save, or a reload). The draft is kept when it has changes and follows the server's when it has none. */
  replaceSaved(doc: Doc): void {
    const wasDirty = this.dirty();
    this.saved.set(doc);
    if (!wasDirty) {
      this.doc.set(doc);
      this.past.set([]);
      this.future.set([]);
    }
  }

  /** The server took this draft (a save): what it answered is the saved document and the draft too, and the history stays. */
  settle(server: Doc): void {
    this.saved.set(server);
    this.doc.set(server);
    this.lastLabel = undefined;
  }

  /** The draft is thrown away for what the server has. */
  discard(): void {
    this.doc.set(this.saved());
    this.past.set([]);
    this.future.set([]);
    this.lastLabel = undefined;
  }
}
