import { THEME_ASSETS_MAX, THEME_ASSET_BYTES, THEME_ASSET_NAME, THEME_HUD_MAX, TRANSITION_MAX, addLayerWithItem, layerEditProblem, type Catalog, type Design, type Script, type Theme, type ThemeHud } from '@lab/animation-core';

/** The parts the Frame preset puts over the song: the corner texts of the theme and a film grain. Each takes a layer of its own, because the items of a layer never overlap. */
export const FRAME_PARTS = ['hud-chrome', 'grain'] as const;

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

/** A theme with nothing in it is no theme: empty texts, drawings and corners are left out, so that the design the server keeps stays as small as the person made it. */
export function compactTheme(theme: Theme): Theme | undefined {
  const css = theme.css?.trim() ? theme.css : undefined;
  const assets = theme.assets && Object.keys(theme.assets).length ? theme.assets : undefined;
  const hudEntries = CORNERS.flatMap((c) => (theme.hud?.[c]?.trim() ? [[c, theme.hud[c]] as const] : []));
  const hud: ThemeHud | undefined = hudEntries.length ? Object.fromEntries(hudEntries) : undefined;
  if (!css && !assets && !hud) return undefined;
  return { ...(css ? { css } : {}), ...(assets ? { assets } : {}), ...(hud ? { hud } : {}) };
}

/** The design with a change made to its theme. */
export function withTheme(design: Design, change: Partial<Theme>): Design {
  const next = compactTheme({ ...design.theme, ...change });
  const { theme: _old, ...rest } = design;
  return next ? { ...rest, theme: next } : rest;
}

/** The design with another crossfade; `undefined` (or a cut that was never set) leaves none. */
export function withTransition(design: Design, seconds: number | undefined): Design {
  const { transitionSeconds: _old, ...rest } = design;
  return seconds === undefined || !(seconds > 0) ? rest : { ...rest, transitionSeconds: Math.min(TRANSITION_MAX, Math.round(seconds * 100) / 100) };
}

/** The name an uploaded file gets as a drawing: its own, in the letters the server takes. */
export function assetNameOf(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  const named = /^[a-z]/.test(base) ? base : `a${base}`;
  return (named === 'a' ? 'drawing' : named).slice(0, 32);
}

export type AssetProblem = 'name' | 'size' | 'svg' | 'full' | 'duplicate';

/** Whether a drawing can be added under a name: the checks the server makes, before it is asked. `size` is in characters, as the server counts. */
export function assetProblem(name: string, svg: string, assets: Readonly<Record<string, string>> = {}): AssetProblem | null {
  if (!THEME_ASSET_NAME.test(name)) return 'name';
  if (!/^\s*<svg[\s>]/i.test(svg)) return 'svg';
  if (svg.length > THEME_ASSET_BYTES) return 'size';
  if (name in assets) return 'duplicate';
  if (Object.keys(assets).length >= THEME_ASSETS_MAX) return 'full';
  return null;
}

/** A picture to show an SVG as a thumbnail: an `<img>` runs no script, so what the server would refuse can still be looked at. */
export const thumbnailOf = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** The text of a corner, cut to what the server takes. */
export const hudText = (text: string): string => text.slice(0, THEME_HUD_MAX);

export interface FrameResult {
  readonly script: Script;
  /** `added`: the layers were added; `has`: the script already draws both parts in layers; `refused`: it cannot be added, and `reason` says why. */
  readonly result: 'added' | 'has' | 'refused';
  readonly reason?: string;
}

const songEnd = (script: Script): number => script.pieces.at(-1)?.end ?? 0;

/** Adds the frame over the whole song, as one change of the script: a layer with the HUD and another with the grain. */
export function framePreset(script: Script, catalog: Pick<Catalog, 'parts'>): FrameResult {
  const drawn = new Set((script.layers ?? []).flatMap((l) => l.items.map((i) => i.part)));
  const missing = FRAME_PARTS.filter((p) => !drawn.has(p));
  if (missing.length === 0) return { script, result: 'has' };
  const end = songEnd(script);
  let next = script;
  for (const part of missing) {
    const made = addLayerWithItem(next, { part, start: 0, end }, catalog);
    if (made === next) {
      const free = addLayerWithItem(next, { part, start: 0, end });
      return { script, result: 'refused', reason: (free !== next ? layerEditProblem(next, free, catalog) : null) ?? part };
    }
    next = made;
  }
  return { script: next, result: 'added' };
}

/** The crossfade into one piece of the script (`undefined` gives it back to the design's). Written as the server writes it, `transition_seconds`. */
export function withPieceTransition(script: Script, index: number, seconds: number | undefined): Script {
  const piece = script.pieces[index];
  if (!piece) return script;
  const { transition_seconds: _old, ...rest } = piece;
  const next = seconds === undefined ? rest : { ...rest, transition_seconds: Math.min(TRANSITION_MAX, Math.max(0, Math.round(seconds * 100) / 100)) };
  return { ...script, pieces: script.pieces.map((p, i) => (i === index ? (next as typeof p) : p)) };
}
