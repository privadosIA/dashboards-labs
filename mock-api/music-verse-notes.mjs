// The advice about where the verse is read, as the contract describes it (`verse_notes`, the parts' `bands`, the preview's `local_scrims`): the pure parts of the mock's answer.
// A note about a piece follows the server's stated rule from the bands of its main part. The mock has no pixels, so a note about an item and its local scrim come from a rule of its own:
// a clip whose name contains `bright` leaves the accent at 2.1:1 on the band of the verse, and the local scrim the server would lay there is 0.5.

export const OCCUPIED = 0.2;
export const CLEAR = 0.1;
export const BRIGHT_CONTRAST = 2.1;
export const BRIGHT_SCRIM = 0.5;
const ORDER = ['top', 'center', 'bottom'];

/** Where some built-in parts paint (the share of each third of the frame). A part that fills the frame, or that nobody measured, has none and gives no note. */
export const BANDS = {
  toggle: { top: 0.05, center: 0.1, bottom: 0.7 },
  counter: { top: 0.05, center: 0.65, bottom: 0.05 },
  'glass-card': { top: 0.05, center: 0.5, bottom: 0.08 },
  'depth-stack': { top: 0.3, center: 0.35, bottom: 0.3 },
  terminal: { top: 0.05, center: 0.1, bottom: 0.6 },
  blank: { top: 0, center: 0, bottom: 0 },
};

/** The band where a piece's verse is drawn: its own `verse_layout`, else the design's, else the bottom. */
export const bandOf = (piece, design) => piece?.design?.verse_layout?.position ?? design?.verse_layout?.position ?? 'bottom';

const hasVerse = (piece) => Array.isArray(piece?.lines) && piece.lines.length > 0;

/** The notes about the pieces of the saved script: the verse is on a band its main part paints by 0.2 or more and another band is below 0.1. */
export function pieceNotes(script, design, parts) {
  const out = [];
  for (const piece of script?.pieces ?? []) {
    if (!piece.part || piece.blender !== undefined || !hasVerse(piece)) continue;
    const bands = parts.find((p) => p.name === piece.part)?.bands;
    if (!bands) continue;
    const band = bandOf(piece, design);
    const share = bands[band];
    if (!(share >= OCCUPIED)) continue;
    const free = ORDER.filter((b) => b !== band).sort((a, b) => bands[a] - bands[b] || ORDER.indexOf(a) - ORDER.indexOf(b))[0];
    if (!(bands[free] < CLEAR)) continue;
    out.push({ piece: piece.id, part: piece.part, band, share, free });
  }
  return out;
}

const bright = (item) => /bright/i.test(item.clip ?? '');

/** The band where the verse of the first piece with a verse that an item plays under is drawn, or '' when there is none. */
function verseBandUnder(item, script, design) {
  const piece = (script?.pieces ?? []).find((p) => hasVerse(p) && item.start < p.end && item.end > p.start);
  return piece ? bandOf(piece, design) : '';
}

/** The notes about the items of the track whose clip leaves the accent under 3:1 on the band of the verse. */
export function itemNotes(script, design) {
  const out = [];
  for (const item of script?.video ?? []) {
    if (!bright(item)) continue;
    const band = verseBandUnder(item, script, design);
    if (band) out.push({ item: item.id, band, contrast: BRIGHT_CONTRAST });
  }
  return out;
}

/** The strips the preview lists for an item: one on the band of the verse when its clip is bright. Never saved in the script. */
export function localScrims(item, script, design) {
  if (!bright(item)) return [];
  const band = verseBandUnder(item, script, design);
  return band ? [{ band, scrim: BRIGHT_SCRIM }] : [];
}
