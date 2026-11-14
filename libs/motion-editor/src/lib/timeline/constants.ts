/** How many parts a piece may carry besides its main one. */
export const MAX_EXTRAS = 3;

/** From this many parts on a page the block says how many it has, since the server draws at most `MAX_PAGE_PARTS`. */
export const PAGE_PARTS_NOTE_FROM = 6;

/** A word is drawn on the timeline only when it is at least this wide, in pixels. */
export const MIN_WORD_PX = 24;

/** The height of each lane, in pixels. */
export const LANE_HEIGHT = { ruler: 24, sections: 20, loudness: 40, words: 20, main: 36, extra: 22, layer: 22, newLayer: 18, keyframe: 20 } as const;
