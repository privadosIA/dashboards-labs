/** What is selected on the timeline and in the layers: a script piece, or one of its extra parts (`extra` is its index in `with`). */
export interface Selection {
  readonly piece: string;
  readonly extra?: number;
  /** Index of a text line of the piece (its dot on the main block). */
  readonly line?: number;
  /** A keyframe of the piece's part (or of its extra, with `extra`): the parameter it animates and its place in that parameter's list. */
  readonly param?: string;
  readonly keyframe?: number;
}

/** An item of a layer, selected apart from the pieces: its layer and its place in the lane, and a keyframe of one of its parameters. */
export interface ItemSelection {
  readonly layer: string;
  readonly item: number;
  readonly param?: string;
  readonly keyframe?: number;
}

export const sameItemSelection = (a: ItemSelection | null | undefined, b: ItemSelection | null | undefined): boolean =>
  (a ?? null) === (b ?? null) || (!!a && !!b && a.layer === b.layer && a.item === b.item && a.param === b.param && a.keyframe === b.keyframe);

export const sameSelection = (a: Selection | null | undefined, b: Selection | null | undefined): boolean => (a ?? null) === (b ?? null) || (!!a && !!b && a.piece === b.piece && a.extra === b.extra && a.line === b.line && a.param === b.param && a.keyframe === b.keyframe);
