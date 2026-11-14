import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { VectorEditorPage, VectorSend, type Beat, type LoudnessAt, type VectorDocument } from '@lab/vector-editor';

import { LanguageService } from '../../../core/language';
import { textsFor } from '../../../core/texts';
import { PartSink } from '../part-sink';
import type { VectorSession } from '../vector-session';

/** What the tab says it did: a part of the catalog was replaced, or a new one was approved. */
export interface VectorSaved {
  readonly name: string;
  readonly replaced: boolean;
}

/**
 * The Vector tab: the vector editor's page for the part chosen in the piece, with the piece's beats and loudness in its canvas, a silent
 * transport in the part's own time and a toolbar of its own. Save goes through the library's send dialog (Replace for a part of the catalog,
 * the new-part cycle for a new one); Save as new sends the document under another name. What it keeps is the session's: the tab does not own the
 * document, so it survives the tab being hidden.
 */
@Component({
  selector: 'app-vector-tab',
  imports: [VectorEditorPage, VectorSend],
  providers: [PartSink],
  templateUrl: './vector-tab.html',
  styleUrl: './vector-tab.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorTab {
  readonly session = input.required<VectorSession>();
  /** The beat and the loudness of the piece at a time of the part (the block's slice of the song map). */
  readonly beatAt = input<((t: number) => Beat | null) | undefined>(undefined);
  readonly loudnessAt = input<LoudnessAt | undefined>(undefined);
  /** How many pieces of the open script draw the part: Replace changes them all. */
  readonly uses = input(0);
  readonly saved = output<VectorSaved>();
  readonly help = output<void>();
  /** The save window was closed (after saving or not). */
  readonly closed = output<void>();

  protected readonly sink = inject(PartSink);
  protected readonly t = textsFor(inject(LanguageService).lang).vector;
  protected readonly sendOpen = signal(false);
  private readonly asNew = signal(false);

  protected readonly store = computed(() => this.session().store());
  protected readonly dirty = computed(() => this.session().dirty());
  protected readonly partName = computed(() => this.session().partName());
  protected readonly title = computed(() => (this.partName() ? this.t.editing(this.partName()!) : this.t.creating));
  /** The document the dialog sends: with the part's name it replaces it, without it makes a new part. */
  protected readonly sendDoc = computed<VectorDocument | null>(() => {
    const doc = this.store()?.doc();
    if (!doc) return null;
    return this.asNew() ? { ...doc, partName: undefined } : doc;
  });

  /** Save: replaces the part (or sends a new one). */
  openSend(asNew: boolean): void {
    this.asNew.set(asNew);
    this.sendOpen.set(true);
  }

  protected sendOpenChange(open: boolean): void {
    this.sendOpen.set(open);
    if (!open) this.closed.emit();
  }

  protected discard(): void {
    if (!this.dirty() || confirm(this.t.discardAsk)) this.session().discard();
  }

  protected sent(name: string): void {
    const was = this.partName();
    const replaced = !this.asNew() && was === name;
    this.session().saved(name);
    this.saved.emit({ name, replaced });
  }
}
