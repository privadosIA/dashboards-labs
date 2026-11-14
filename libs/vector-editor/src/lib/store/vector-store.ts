import { computed, signal } from '@angular/core';

import { newId, type VectorDocument } from '../model/document';
import { duplicate, group, sendBackward, sendForward, sendToBack, sendToFront, ungroup, VectorEditError } from '../model/edits';
import { fromJson, toJson } from '../model/json';
import { findNode, pathTo, siblingsOf, walk } from '../model/tree';
import type { AlignMode, DistributeMode } from '../tools/align';
import type { Tool } from '../tools/tools';

/** Edits of the same kind (the same label) closer than this to each other are one step of the history: typing in one field. */
export const COALESCE_MS = 500;
const MAX_HISTORY = 200;

/** What the canvas can do that needs its drawing (boxes on the screen): the panels ask for it through the store. */
export interface CanvasActions {
  /** Aligns the selection to its own box (two or more nodes) or, with `toArtboard` or for one node, to the artboard. */
  align(mode: AlignMode, toArtboard: boolean): void;
  distribute(mode: DistributeMode): void;
}

export type Notice = 'image-type' | 'image-size' | 'image-large' | 'image-failed';

const same = (a: VectorDocument, b: VectorDocument): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * The document being edited, with the last one saved, a history to undo and redo, and what every panel follows: the selection, the
 * playhead and whether it is playing. Documents are immutable and share what an edit did not touch, so the history just keeps them.
 * A drag or a burst of typing is one step. The same shape as `motion-edit`'s EditorStore, without sharing code.
 */
export class VectorStore {
  readonly saved = signal<VectorDocument>(undefined as unknown as VectorDocument);
  readonly doc = signal<VectorDocument>(undefined as unknown as VectorDocument);
  readonly past = signal<readonly VectorDocument[]>([]);
  readonly future = signal<readonly VectorDocument[]>([]);
  readonly dirty = computed(() => !same(this.doc(), this.saved()));
  readonly canUndo = computed(() => this.past().length > 0);
  readonly canRedo = computed(() => this.future().length > 0);

  private readonly rawSelection = signal<readonly string[]>([]);
  /** The ids selected that are still in the document. */
  readonly selection = computed(() => {
    const ids = new Set([...walk(this.doc().nodes)].map((n) => n.id));
    return this.rawSelection().filter((id) => ids.has(id));
  });
  readonly selectedNodes = computed(() => this.selection().map((id) => findNode(this.doc().nodes, id)!));

  /** What a click or a drag on the canvas does; it goes back to `select` after a node is drawn (unless Shift is held). */
  readonly tool = signal<Tool>('select');
  /** The text node whose words are being typed in place, if any. */
  readonly editingText = signal<string | undefined>(undefined);
  /** Set by the canvas while it is on the page. */
  readonly canvasActions = signal<CanvasActions | undefined>(undefined);
  /** The last thing that was not done as asked or deserves a word (a picture too big or too heavy), for the page to say in its language. */
  readonly notice = signal<Notice | undefined>(undefined);

  /** Seconds. */
  readonly playhead = signal(0);
  readonly playing = signal(false);
  readonly loop = signal(true);
  /** Why the last edit was refused, until the next one that is not. */
  readonly problem = signal<VectorEditError | undefined>(undefined);

  private lastLabel: string | undefined;
  private lastAt = 0;
  private gesture = false;

  constructor(
    initial: VectorDocument,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.saved.set(initial);
    this.doc.set(initial);
  }

  /** Changes the document with `fn`. With a `label`, edits of the same label within `COALESCE_MS` make one step. A change that changes nothing is not a step. */
  apply(fn: (doc: VectorDocument) => VectorDocument, label?: string): void {
    const before = this.doc();
    let next: VectorDocument;
    try {
      next = fn(before);
    } catch (e) {
      if (e instanceof VectorEditError) {
        this.problem.set(e);
        return;
      }
      throw e;
    }
    this.problem.set(undefined);
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

  update(fn: (doc: VectorDocument) => VectorDocument): void {
    if (!this.gesture) return;
    try {
      this.doc.set(fn(this.doc()));
      this.problem.set(undefined);
    } catch (e) {
      if (!(e instanceof VectorEditError)) throw e;
      this.problem.set(e);
    }
  }

  /** Ends the gesture; one that ended where it began leaves no step. */
  end(): void {
    if (!this.gesture) return;
    this.gesture = false;
    const past = this.past();
    if (past.length > 0 && same(past[past.length - 1], this.doc())) this.past.set(past.slice(0, -1));
  }

  get inGesture(): boolean {
    return this.gesture;
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

  /** Opens another document: it is the saved one too, and the history, the selection and the playhead start over. */
  load(doc: VectorDocument): void {
    this.saved.set(doc);
    this.doc.set(doc);
    this.past.set([]);
    this.future.set([]);
    this.rawSelection.set([]);
    this.playhead.set(0);
    this.playing.set(false);
    this.problem.set(undefined);
    this.lastLabel = undefined;
  }

  /**
   * Takes a document as work not yet kept: it replaces the document but not the saved one (so `dirty` stays true), and the history, the selection
   * and the playhead start over. A draft found in the browser is opened this way.
   */
  adopt(doc: VectorDocument): void {
    this.doc.set(doc);
    this.past.set([]);
    this.future.set([]);
    this.rawSelection.set([]);
    this.playhead.set(0);
    this.playing.set(false);
    this.problem.set(undefined);
    this.lastLabel = undefined;
  }

  /** Opens a document from its JSON; a text that is not one throws `VectorModelError` and nothing changes. */
  loadJson(text: string): void {
    this.load(fromJson(text));
  }

  toJson(): string {
    return toJson(this.doc());
  }

  /** What is in the editor is what was kept (a save, an export): `dirty` is false until the next edit. */
  markSaved(): void {
    this.saved.set(this.doc());
  }

  select(ids: readonly string[], additive = false): void {
    this.rawSelection.set(additive ? [...new Set([...this.rawSelection(), ...ids])] : [...ids]);
  }

  toggleSelect(id: string): void {
    const now = this.selection();
    this.rawSelection.set(now.includes(id) ? now.filter((i) => i !== id) : [...now, id]);
  }

  clearSelection(): void {
    this.rawSelection.set([]);
  }

  /** The selected nodes that have no selected ancestor: acting on both would act twice on the child. */
  topmostSelection(): string[] {
    const doc = this.doc();
    const ids = this.selection();
    return ids.filter((id) => !ids.some((other) => other !== id && pathTo(doc.nodes, id)?.includes(other) === true));
  }

  /** Ctrl+D: copies the selection right above itself and selects the copies. */
  duplicateSelection(): void {
    const ids = this.topmostSelection();
    if (!ids.length) return;
    let made: string[] = [];
    this.apply((doc) => {
      const r = duplicate(doc, ids);
      made = r.ids;
      return r.doc;
    });
    if (made.length) this.select(made);
  }

  /** Ctrl+G: wraps the selection in a group and selects it. */
  groupSelection(): void {
    const ids = this.topmostSelection();
    if (!ids.length) return;
    const id = newId(this.doc(), 'group');
    this.apply((doc) => group(doc, ids, id));
    if (!this.problem() && findNode(this.doc().nodes, id)) this.select([id]);
  }

  /** Ctrl+Shift+G: takes the children out of every selected group and selects them; a group with tracks is refused with the sentence. */
  ungroupSelection(): void {
    const groups = this.selection().filter((id) => findNode(this.doc().nodes, id)?.kind === 'group');
    if (!groups.length) return;
    const children = groups.flatMap((id) => findNode(this.doc().nodes, id)!.children.map((c) => c.id));
    this.apply((doc) => groups.reduce((d, id) => ungroup(d, id), doc));
    if (!this.problem()) this.select(children);
  }

  /** `[` and `]`: the selection one step back or forward among its siblings, or (`far`) to the back or the front. */
  arrangeSelection(direction: 'back' | 'forward', far: boolean): void {
    const ids = this.topmostSelection();
    if (!ids.length) return;
    const index = (doc: VectorDocument, id: string): number => siblingsOf(doc.nodes, id)?.findIndex((n) => n.id === id) ?? 0;
    this.apply((doc) => {
      // Each node is moved in turn; the order they are taken in keeps them in their order among themselves.
      const topFirst = (direction === 'forward') !== far;
      const order = [...ids].sort((a, b) => (topFirst ? index(doc, b) - index(doc, a) : index(doc, a) - index(doc, b)));
      const move = direction === 'forward' ? (far ? sendToFront : sendForward) : far ? sendToBack : sendBackward;
      return order.reduce((d, id) => move(d, id), doc);
    });
  }

  /** Moves the playhead, clamped to the document. */
  seek(t: number): void {
    this.playhead.set(Math.min(this.doc().duration, Math.max(0, t)));
  }

  play(): void {
    if (this.playhead() >= this.doc().duration) this.playhead.set(0);
    this.playing.set(true);
  }

  pause(): void {
    this.playing.set(false);
  }

  togglePlay(): void {
    if (this.playing()) this.pause();
    else this.play();
  }

  /** Moves the playhead by whole frames of the document's rate. */
  step(frames: number): void {
    this.seek(Math.round((this.playhead() + frames / this.doc().fps) * this.doc().fps) / this.doc().fps);
  }
}
