import { Injectable } from '@angular/core';
import type { VectorDocument } from '@lab/vector-editor';

/** A document that one page hands to the editor when it navigates there: the part the catalog opened. The editor takes it once. */
@Injectable({ providedIn: 'root' })
export class Handoff {
  private waiting: VectorDocument | undefined;

  give(doc: VectorDocument): void {
    this.waiting = doc;
  }

  take(): VectorDocument | undefined {
    const doc = this.waiting;
    this.waiting = undefined;
    return doc;
  }
}
