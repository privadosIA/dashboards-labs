import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { sectionTags } from '@lab/music-motion';
import type { Catalog, PieceDetail, PieceReview } from '@lab/animation-core';
import type { Doc, ItemSelection, Selection, Warning } from '@lab/motion-editor';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { DesignPanel } from './design-panel/design-panel';
import { Collapsible } from '../../shared/collapsible/collapsible';
import type { EditRequest } from './edit';
import { ItemPanel } from './item-panel/item-panel';
import { PiecePanel } from './piece-panel/piece-panel';

/**
 * What the selected piece (or extra part) is made of, and the way to change it: its part and parameters, its mode, its lyrics, its
 * full-screen word, its extra parts, its stage and its own design. With nothing selected, the song's design with its typefaces. It never
 * changes anything itself: every change goes out as a request for the page, which owns the document, the history and the save.
 */
@Component({
  selector: 'app-inspector',
  imports: [Collapsible, DesignPanel, ItemPanel, PiecePanel],
  templateUrl: './inspector.html',
  styleUrl: './inspector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Inspector {
  /** What is being edited (the song's design and the script). */
  readonly doc = input.required<Doc>();
  /** The piece as the server has it: its song map, level and size. */
  readonly piece = input.required<PieceDetail>();
  readonly catalog = input.required<Catalog>();
  readonly selection = input<Selection | null>(null);
  /** An item of a layer, selected apart from the pieces: it takes the place of the piece's panel. */
  readonly itemSelection = input<ItemSelection | null>(null);
  /** The server is drawing or the assistant is writing: nothing can be edited. */
  readonly locked = input(false);
  /** The server's reason for refusing each piece of the script, by id. */
  readonly refusedPieces = input<Readonly<Record<string, string>>>({});
  readonly refusedDesign = input('');
  /** What the live checks found in the draft, for every piece. */
  readonly warnings = input<readonly Warning[]>([]);
  /** Where the playhead is, in song seconds. */
  readonly playhead = input(0);
  /** The last review of the piece, for the notes of the chosen block. */
  readonly review = input<PieceReview | null>(null);
  readonly edit = output<EditRequest>();
  /** Scene…: a scene is wanted for this piece of the script (its id). */
  readonly writeScene = output<string>();
  /** Edit scene…: the texts of the scene that is this piece's part. */
  readonly editScene = output<{ readonly piece: string; readonly part: string }>();
  /** The person asked for the song's design instead of the piece. */
  readonly deselect = output<void>();
  /** A keyframe was chosen in the panel of the piece or of one of its extras. */
  readonly pick = output<Selection>();
  /** A keyframe was chosen in the panel of an item. */
  readonly pickItem = output<ItemSelection>();

  protected readonly t = textsFor(inject(LanguageService).lang);
  protected readonly selected = computed(() => {
    const sel = this.selection();
    return sel && this.doc().script.pieces.some((p) => p.id === sel.piece) ? sel : null;
  });
  /** The selected item, when it is still in the script. */
  protected readonly selectedItem = computed(() => {
    const sel = this.itemSelection();
    return sel && this.doc().script.layers?.find((l) => l.id === sel.layer)?.items[sel.item] ? sel : null;
  });
  protected readonly itemKeyframe = computed(() => {
    const s = this.selectedItem();
    return s && s.param !== undefined && s.keyframe !== undefined ? { param: s.param, keyframe: s.keyframe } : null;
  });
  protected readonly tags = computed(() => sectionTags(this.piece()));
  /** The selected keyframe, when the selection is one. */
  protected readonly keyframe = computed(() => {
    const s = this.selected();
    return s && s.param !== undefined && s.keyframe !== undefined ? { param: s.param, keyframe: s.keyframe } : null;
  });

  protected pickItemKeyframe(sel: ItemSelection, found: { readonly param: string; readonly keyframe: number }): void {
    this.pickItem.emit({ layer: sel.layer, item: sel.item, param: found.param, keyframe: found.keyframe });
  }

  protected pickKeyframe(sel: Selection, found: { readonly param: string; readonly keyframe: number }): void {
    this.pick.emit({ piece: sel.piece, ...(sel.extra !== undefined ? { extra: sel.extra } : {}), param: found.param, keyframe: found.keyframe });
  }
}
