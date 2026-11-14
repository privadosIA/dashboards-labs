/** What can be taken from the palette and put on the timeline: a part of the catalog, or a text that appears on screen. */
export type PaletteItem = { readonly kind: 'part'; readonly name: string } | { readonly kind: 'text' };

/** The type under which the palette puts its item in a drag, so that nothing else dragged over the timeline is taken for one. */
export const PALETTE_MIME = 'application/x-motion-palette-item';

export const itemToJson = (item: PaletteItem): string => JSON.stringify(item);

/** The item in a drag's data, or `null` when it is not one of ours. */
export function itemFromJson(text: string): PaletteItem | null {
  try {
    const v = JSON.parse(text) as { kind?: unknown; name?: unknown };
    if (v.kind === 'text') return { kind: 'text' };
    if (v.kind === 'part' && typeof v.name === 'string' && v.name !== '') return { kind: 'part', name: v.name };
  } catch {
    // not ours
  }
  return null;
}
