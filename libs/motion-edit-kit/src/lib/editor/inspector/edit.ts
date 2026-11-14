import type { Script } from '@lab/animation-core';
import type { Doc } from '@lab/motion-editor';

/** A change the inspector asks the page to make to the document. `label` joins a burst of edits of one field into one step of the history. */
export interface EditRequest {
  readonly fn: (doc: Doc) => Doc;
  readonly label?: string;
}

/** An edit of the script only. */
export const onScript = (fn: (script: Script) => Script, label?: string): EditRequest => ({ fn: (d) => ({ ...d, script: fn(d.script) }), ...(label ? { label } : {}) });
