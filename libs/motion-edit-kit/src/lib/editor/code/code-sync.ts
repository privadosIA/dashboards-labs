import { computed, signal } from '@angular/core';
import type { Catalog, Script, SongMap } from '@lab/animation-core';
import type { Doc } from '@lab/motion-editor';
import { mapCode, toCode, type Diagnostic, type PieceSite } from '@lab/motion-editor/code';

/** What the mapper needs besides the document: the catalog and the song the piece is made from. */
export interface CodeInputs {
  readonly catalog: Catalog;
  readonly songMap: SongMap;
  readonly level: string;
}

export interface CodeSyncOptions {
  /** The document being edited, or null while there is none. */
  readonly doc: () => Doc | null;
  readonly inputs: () => CodeInputs | null;
  /** The code maps to another script: the page applies it to the store as one entry of the history. */
  readonly apply: (script: Script) => void;
  /** How long after the last key the code is read again. */
  readonly debounceMs?: number;
}

export const CODE_DEBOUNCE_MS = 300;

/**
 * The two views of one document. The code is a text; the document is the truth. Typing reads the code again a little after the last key:
 * when it maps with no errors the document takes it, and when it does not the document stays as it was and the visual editing is paused.
 * A change made by anything else (the visual editor, an undo) makes the code be written again from the document, because the text is
 * only a view. The text is never saved anywhere.
 */
export class CodeSync {
  /** The code in the pane. */
  readonly text = signal('');
  readonly diagnostics = signal<readonly Diagnostic[]>([]);
  /** Where each piece is in the code, from the last time it was read. */
  readonly sites = signal<readonly PieceSite[]>([]);
  /** The code has errors: the document is the last one that mapped and the visual editing waits. */
  readonly paused = computed(() => this.diagnostics().some((d) => d.severity === 'error'));
  readonly errorCount = computed(() => this.diagnostics().filter((d) => d.severity === 'error').length);

  /** The code that was last written from the document: when the text differs, the person has made it their own. */
  private generated = '';
  /** The script the code stands for (the last one it mapped to, or the one it was written from). */
  private mappedJson: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastInputs: CodeInputs | null = null;
  private replacedPending = false;
  private replacedTold = false;

  constructor(private readonly options: CodeSyncOptions) {}

  /** Called whenever the document or the inputs may have changed, and when the Code tab is shown. */
  reconcile(): void {
    const doc = this.options.doc();
    const inputs = this.options.inputs();
    if (!doc || !inputs) return;
    const json = JSON.stringify(doc.script);
    if (this.mappedJson === null || (json !== this.mappedJson && this.timer === undefined)) {
      this.write(doc, inputs, json);
    } else if (inputs !== this.lastInputs) {
      this.read(inputs, doc, false);
    }
    this.lastInputs = inputs;
  }

  /** The person typed: the text is theirs, and it is read again when they stop. */
  edit(text: string): void {
    if (text === this.text()) return;
    this.text.set(text);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const doc = this.options.doc();
      const inputs = this.options.inputs();
      if (doc && inputs) this.read(inputs, doc, true);
    }, this.options.debounceMs ?? CODE_DEBOUNCE_MS);
  }

  /** Throws the code away and writes it again from the document. */
  revert(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const doc = this.options.doc();
    const inputs = this.options.inputs();
    if (doc && inputs) this.write(doc, inputs, JSON.stringify(doc.script), false);
  }

  /** Another piece is open: nothing of the old one is kept. */
  reset(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.text.set('');
    this.diagnostics.set([]);
    this.sites.set([]);
    this.generated = '';
    this.mappedJson = null;
    this.lastInputs = null;
    this.replacedPending = false;
  }

  /** Whether comments or formatting of the person's were just replaced and they have not been told yet this session. */
  takeReplaced(): boolean {
    if (!this.replacedPending || this.replacedTold) return false;
    this.replacedPending = false;
    this.replacedTold = true;
    return true;
  }

  destroy(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Writes the code from the document. */
  private write(doc: Doc, inputs: CodeInputs, json: string, noticeable = true): void {
    if (noticeable && this.text() !== '' && this.text() !== this.generated) this.replacedPending = true;
    const text = toCode(doc.script, { songMap: inputs.songMap });
    this.generated = text;
    this.mappedJson = json;
    this.text.set(text);
    this.read(inputs, doc, false);
  }

  /** Reads the code: its diagnostics and sites always, and its script into the document when asked and when it has no errors. */
  private read(inputs: CodeInputs, doc: Doc, apply: boolean): void {
    const result = mapCode(this.text(), { catalog: inputs.catalog, songMap: inputs.songMap, design: doc.design, level: inputs.level });
    this.diagnostics.set(result.diagnostics);
    this.sites.set(result.sites);
    if (!apply || !result.script) return;
    const json = JSON.stringify(result.script);
    this.mappedJson = json;
    if (json !== JSON.stringify(doc.script)) this.options.apply(result.script);
  }
}
