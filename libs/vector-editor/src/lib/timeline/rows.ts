import { PROPERTIES, type Keyframe, type Node, type Property } from '../model/document';
import { walk } from '../model/tree';

export interface TimelineRow {
  id: string;
  nodeName: string;
  property: Property;
  frames: readonly Keyframe[];
}

/** One row for every animated property of the nodes given, in the order of the properties. */
export function rowsFor(nodes: readonly Node[]): TimelineRow[] {
  return nodes.flatMap((node) =>
    PROPERTIES.filter((property) => (node.tracks[property]?.length ?? 0) > 0).map((property) => ({ id: node.id, nodeName: node.name, property, frames: node.tracks[property]! })),
  );
}

/** Every node of the document that has a track, in drawing order. */
export const animatedNodes = (nodes: readonly Node[]): Node[] => [...walk(nodes)].filter((n) => Object.values(n.tracks).some((t) => t && t.length > 0));

/** The ticks of the ruler: every second, and every frame between them when they are far enough apart to tell. */
export function ticks(duration: number, fps: number, width: number): Array<{ t: number; major: boolean }> {
  const out: Array<{ t: number; major: boolean }> = [];
  const frameGap = duration > 0 ? width / (duration * fps) : 0;
  const withFrames = frameGap >= 6;
  const step = withFrames ? 1 / fps : 1;
  const count = Math.floor(duration / step + 1e-9);
  for (let i = 0; i <= count; i++) {
    const t = Math.round(i * step * 1e6) / 1e6;
    out.push({ t, major: Math.abs(t - Math.round(t)) < 1e-6 });
  }
  return out;
}

/** The time under a pointer on a track `width` pixels wide that starts at `left`, clamped, and on a frame when asked. */
export function timeAt(clientX: number, left: number, width: number, duration: number, fps: number, snap: boolean): number {
  const raw = width > 0 ? ((clientX - left) / width) * duration : 0;
  const t = Math.min(duration, Math.max(0, snap ? Math.round(raw * fps) / fps : raw));
  return Math.round(t * 1000) / 1000;
}
