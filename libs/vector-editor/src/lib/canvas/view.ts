import type { Box } from '../import/measure';

export interface Pt {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** What the canvas shows of the artboard: how big the canvas is, a zoom over the fit and a pan in pixels. */
export interface View {
  vb: Box;
  size: Size;
  /** 1 is the artboard fitted in the canvas. */
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 40;
/** The share of the canvas the artboard fills when it is fitted. */
const FIT = 0.9;

export const fitView = (vb: Box, size: Size): View => ({ vb, size, zoom: 1, panX: 0, panY: 0 });

/** Screen pixels per unit of the artboard. */
export const scaleOf = (v: View): number => Math.max(1e-6, FIT * Math.min(v.size.width / v.vb.width, v.size.height / v.vb.height) * v.zoom);

const originOf = (v: View): Pt => {
  const s = scaleOf(v);
  return { x: (v.size.width - v.vb.width * s) / 2 + v.panX, y: (v.size.height - v.vb.height * s) / 2 + v.panY };
};

export function toScreen(v: View, p: Pt): Pt {
  const s = scaleOf(v);
  const o = originOf(v);
  return { x: o.x + (p.x - v.vb.x) * s, y: o.y + (p.y - v.vb.y) * s };
}

export function toArt(v: View, p: Pt): Pt {
  const s = scaleOf(v);
  const o = originOf(v);
  return { x: v.vb.x + (p.x - o.x) / s, y: v.vb.y + (p.y - o.y) / s };
}

/** The `viewBox` of the drawing's `<svg>`, so that the artboard's units land where `toScreen` says. */
export function stageBox(v: View): string {
  const s = scaleOf(v);
  const o = originOf(v);
  const x = v.vb.x - o.x / s;
  const y = v.vb.y - o.y / s;
  return `${x} ${y} ${v.size.width / s} ${v.size.height / s}`;
}

/** Zooms by a factor around a point of the screen, which stays where it is. */
export function zoomAt(v: View, factor: number, at: Pt): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  if (zoom === v.zoom) return v;
  const art = toArt(v, at);
  const next = { ...v, zoom };
  const moved = toScreen(next, art);
  return { ...next, panX: v.panX + at.x - moved.x, panY: v.panY + at.y - moved.y };
}
