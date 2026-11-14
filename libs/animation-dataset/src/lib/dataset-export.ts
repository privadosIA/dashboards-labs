import { firstValueFrom, type Observable } from 'rxjs';

import { type AnimationPort, type Design, type Part, type Script } from '@lab/animation-core';
import { DATASET_FORMAT, DATASET_VERSION, type AnimationDataset, type FileLook, type FilePart, type FileStyle } from './dataset-file';

const MAX_DESCRIPTION = 300;
const short = (text: string): string => (text.length <= MAX_DESCRIPTION ? text : `${text.slice(0, MAX_DESCRIPTION - 1)}…`);
const first = <T>(o: Observable<T>): Promise<T> => firstValueFrom(o);

/** The own style a piece started from, kept in this browser, if it did and the style is still there. */
/** The look a piece was started from, as the host keeps it: structurally a subset of its own style type. */
export interface LookStyle {
  readonly name: string;
  readonly design: Design;
  readonly rhythm: number;
  readonly parts: readonly string[];
  readonly reference?: string;
}

export type LocalLook = (pieceId: string) => LookStyle | undefined;

/** The names of the parts a script draws, the main one and the extras, once each and in the order they appear. */
export function partsUsed(script: Script): string[] {
  const names = new Set<string>();
  for (const piece of script.pieces) {
    names.add(piece.part);
    for (const extra of piece.with ?? []) names.add(extra.part);
  }
  return [...names];
}

/**
 * The dataset of one animation, read through the port. It reads only what that animation needs: the piece; its style and that style's
 * reference (not the lists); the own style it started from, kept in the browser (`local`); the catalog, to tell which parts of its script
 * are the user's; and the drafts only when a part of the script is the user's or is not in the catalog, to find a ready draft that carries
 * its text. A part that comes with the server is not exported. An approved part of the user's cannot be read back, so it goes as its
 * description and parameters with `text: null`. It works the same with the server's adapter and the in-memory one.
 */
export async function buildAnimationExport(port: AnimationPort, pieceId: string, local: LocalLook = () => undefined, now: () => Date = () => new Date()): Promise<AnimationDataset> {
  const piece = await first(port.piece(pieceId));

  const look: FileLook = {};
  const own = local(pieceId);
  if (own) {
    look.style = { name: own.name, ...(own.reference ? { reference: own.reference } : {}), design: own.design, rhythm: own.rhythm, parts: [...own.parts] };
  } else if (piece.preset) {
    const preset = await first(port.preset(piece.preset)).catch(() => undefined);
    if (preset) {
      const reference = preset.referenceId ? await first(port.reference(preset.referenceId)).catch(() => undefined) : undefined;
      const style: FileStyle = { name: preset.name, ...(reference?.source ? { reference: reference.source } : {}), design: preset.design, rhythm: preset.rhythm, parts: [...preset.parts] };
      look.style = style;
      if (reference?.source) look.reference = { title: reference.title, notes: reference.notes, tags: [...reference.tags], source: reference.source };
    }
  }

  const used = partsUsed(piece.script);
  // The piece's own scenes are in the catalog only when it is asked for with the piece.
  const catalog = used.length > 0 ? await first(port.catalog(pieceId)) : { parts: [] as readonly Part[] };
  const byName = new Map(catalog.parts.map((p) => [p.name, p]));
  const wanted = used.filter((n) => byName.get(n)?.source === 'user' || !byName.has(n));
  const parts: FilePart[] = [];
  if (wanted.length > 0) {
    const drafts = await first(port.drafts());
    for (const name of wanted) {
      const known = byName.get(name);
      // A scene is read back like any part the server keeps: it carries its text, which is what makes it travel.
      if (known?.scene) {
        const text = await first(port.partText(name)).catch(() => undefined);
        if (text) {
          parts.push({ name, description: short(known.description), levels: [...known.levels], text: { request: short(known.description), manifest: text.manifest, fragment: text.fragment } });
          continue;
        }
      }
      const summary = drafts.find((d) => d.state === 'ready' && d.name === name);
      const draft = summary ? await first(port.draft(summary.id)).catch(() => undefined) : undefined;
      if (draft?.manifest && draft.fragment) {
        parts.push({ name, description: short(known?.description ?? draft.description ?? draft.request), ...(known ? { levels: [...known.levels] } : {}), text: { request: draft.request, manifest: draft.manifest, fragment: draft.fragment } });
      } else if (known) {
        parts.push({ name, description: short(known.description), levels: [...known.levels], params: known.params.map((p) => ({ name: p.name, type: p.type, default: p.default })), text: null });
      }
    }
  }

  return {
    format: DATASET_FORMAT,
    version: DATASET_VERSION,
    exportedAt: now().toISOString(),
    animation: {
      title: piece.title,
      song: { project: piece.source.project, trackId: piece.source.trackId, variant: piece.source.variant, title: piece.title, seconds: piece.songMap.duration },
      options: { style: piece.style, level: piece.level, fps: piece.fps, resolution: `${piece.width}x${piece.height}` },
      design: piece.design.design,
      script: piece.script,
      ...(look.style || look.reference ? { look } : {}),
      ...(parts.length > 0 ? { parts } : {}),
    },
  };
}
