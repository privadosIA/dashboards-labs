import { firstValueFrom } from 'rxjs';

import { type AnimationPort, type Catalog, type Design, type Draft, type PieceDetail, type Preset, type Reference, type Script, type Song, hasAnimateFeature, hasLayers, hasLayersFeature } from '@lab/animation-core';
import { partsUsed } from './dataset-export';
import type { AnimationDataset } from './dataset-file';

export type PlanKind = 'song' | 'reference' | 'style' | 'part' | 'animation';

/** What would happen to an item: made, already there, kept in the browser, or not possible. */
export type PlanAction = 'create' | 'exists' | 'keep-local' | 'impossible';

/** Why an item is not simply made. The screen words each one in the language of the dashboard. */
export type PlanReason =
  /** A reference with no address cannot be made again. */
  | 'no-address'
  /** The song of the animation is not in the library and none was picked. */
  | 'song-missing'
  /** Parts the catalog does not have and the file does not bring (the names are in `detail`). */
  | 'parts-missing'
  /** A style with no ready reference to start from: the server cannot make it. */
  | 'no-ready-reference'
  /** A part the catalog lacks and the file gives no text for. */
  | 'part-no-text'
  /** The text of a draft does not pass the first check: its manifest is not JSON or does not name the part. */
  | 'draft-invalid'
  /** The animation goes on another song than the file's: its script is fitted to it. */
  | 'fitted'
  /** The script has keyframes and the server does not take them (`detail` names the pieces and parameters): they are dropped, once the person says so. */
  | 'animate-unsupported'
  /** The script has layers and the server does not take them (`detail` names them, and any keyframes that go too): they are dropped, once the person says so. */
  | 'layers-unsupported';

export interface PlanItem {
  readonly kind: PlanKind;
  /** The position in the file's list of own parts, for a part; 0 for the others. */
  readonly index: number;
  readonly label: string;
  /** A part that is a scene written for one script piece of the animation: it is made after the animation's piece, under a new name, and approved. */
  readonly scene?: boolean;
  readonly action: PlanAction;
  readonly reason?: PlanReason;
  /** What the reason is about: the missing parts, the song. */
  readonly detail?: readonly string[];
  /** For a style that is made: the reference it starts from, one of the server's or the one this import makes. */
  readonly base?: { readonly existing: string } | { readonly made: true };
  /** For a style that is already on the server: its id, so the animation can start from it. */
  readonly presetId?: string;
  /** For an animation the server cannot take whole: what the run leaves out of it once the person agrees (`animate`: keyframes, `layers`: lanes). */
  readonly drops?: readonly ('animate' | 'layers')[];
}

export interface ImportPlan {
  readonly items: readonly PlanItem[];
  /** The song the animation would go on: the file's, if the library has it, or the one picked. `null` when there is none. */
  readonly song: Song | null;
  /** Whether that song is not the file's, so the script is fitted to it. */
  readonly fitted: boolean;
  /** How many scenes the file brings with the animation. */
  readonly scenes: number;
}

/** What the server has now, as far as the file needs it. */
export interface CurrentState {
  readonly songs: readonly Song[];
  readonly catalog: Catalog | null;
  readonly references: readonly Reference[];
  readonly presets: readonly Preset[];
  readonly drafts: readonly Draft[];
  /** The animations on the file's song, with their design and script. */
  readonly pieces: readonly PieceDetail[];
  /** The styles kept in this browser: a style of the file that is one of them is already there. */
  readonly localStyles?: readonly { readonly name: string; readonly reference?: string }[];
}

/** One key for the address of a video, whichever way it was written: `youtu.be/x` and `youtube.com/watch?v=x` are the same. */
export function addressKey(address: string): string {
  try {
    const url = new URL(address);
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.split('/')[1];
      if (id) return `yt:${id}`;
    }
    if (host === 'youtube.com') {
      const v = url.searchParams.get('v');
      if (v) return `yt:${v}`;
      const found = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
      if (found) return `yt:${found[1]}`;
    }
    return `${url.protocol}//${host}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return address.trim().toLowerCase();
  }
}

/** A value written the same way whatever the order of its fields, so two designs or scripts can be compared. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** What makes a piece the same as another: the song it follows, its design and its script (`plain` styles are the same as none). */
export function fingerprint(song: { project: string; trackId: string; variant: number }, design: Design, script: Script): string {
  const d: Record<string, unknown> = { ...design };
  if (d['verseStyle'] === 'plain') delete d['verseStyle'];
  if (d['hitStyle'] === 'plain') delete d['hitStyle'];
  return canonical({ song: `${song.project}/${song.trackId}/${song.variant}`, design: d, script });
}

const sameSong = (a: { project: string; trackId: string; variant: number }, b: { project: string; trackId: string; variant: number }): boolean => a.project === b.project && a.trackId === b.trackId && a.variant === b.variant;

function manifestNames(text: string, name: string): boolean {
  try {
    return (JSON.parse(text) as { name?: unknown }).name === name;
  } catch {
    return false;
  }
}

/**
 * What importing the animation would do, item by item, given what the server has now and the song the person picked (the file's own
 * song when none). It touches nothing and asks nothing: the screen shows it before any request that changes the server, and a test
 * reads the same function.
 */
/** The scene a part's manifest says it is, if it does. */
export function sceneOf(manifest: string): { piece: string; script_piece: string } | undefined {
  try {
    const scene = (JSON.parse(manifest) as { scene?: { piece?: unknown; script_piece?: unknown } }).scene;
    return scene && typeof scene.piece === 'string' && typeof scene.script_piece === 'string' ? { piece: scene.piece, script_piece: scene.script_piece } : undefined;
  } catch {
    return undefined;
  }
}

export function planAnimationImport(file: AnimationDataset, current: CurrentState, picked?: { project: string; trackId: string; variant: number }): ImportPlan {
  const a = file.animation;
  const items: PlanItem[] = [];
  const catalogNames = new Set(current.catalog?.parts.map((p) => p.name) ?? []);

  // The song: the file's, if the library has it; or the one picked, which is then a template and the script is fitted to it.
  const own = current.songs.find((s) => sameSong(s, a.song)) ?? null;
  const chosen = picked ? (current.songs.find((s) => sameSong(s, picked)) ?? null) : own;
  const fitted = chosen !== null && !sameSong(chosen, a.song);
  if (chosen) items.push({ kind: 'song', index: 0, label: chosen.title, action: 'exists', ...(fitted ? { reason: 'fitted' as const, detail: [a.song.title] } : {}) });
  else items.push({ kind: 'song', index: 0, label: a.song.title, action: 'impossible', reason: 'song-missing', detail: [a.song.title] });

  // The reference: by its address, however it was written. It comes from the look, or only from the style's address.
  const address = a.look?.reference?.source ?? a.look?.style?.reference;
  const key = address ? addressKey(address) : '';
  const existingRef = key ? current.references.find((r) => r.source && addressKey(r.source) === key) : undefined;
  const usable = key ? current.references.find((r) => r.source && addressKey(r.source) === key && r.state !== 'failed') : undefined;
  if (a.look?.reference || address) {
    const label = a.look?.reference?.title ?? address ?? '';
    if (!address) items.push({ kind: 'reference', index: 0, label, action: 'impossible', reason: 'no-address' });
    else items.push({ kind: 'reference', index: 0, label, action: existingRef ? 'exists' : 'create' });
  }

  // Own parts: the ones the file brings with their text are made as drafts, to be approved by the person.
  const partItems: PlanItem[] = [];
  (a.parts ?? []).forEach((p, index) => {
    const isScene = !!p.text && !!sceneOf(p.text.manifest);
    const base = { kind: 'part' as const, index, label: p.name, ...(isScene ? { scene: true } : {}) };
    // A scene is made again under a new name for the new piece: what the server has with its old name is another piece's.
    if (isScene) return void partItems.push({ ...base, action: manifestNames(p.text!.manifest, p.name) ? 'create' : 'impossible', ...(manifestNames(p.text!.manifest, p.name) ? {} : { reason: 'draft-invalid' as const }) });
    if (catalogNames.has(p.name) || current.drafts.some((d) => d.name === p.name)) return void partItems.push({ ...base, action: 'exists' });
    if (!p.text) return void partItems.push({ ...base, action: 'impossible', reason: 'part-no-text' });
    if (!manifestNames(p.text.manifest, p.name)) return void partItems.push({ ...base, action: 'impossible', reason: 'draft-invalid' });
    partItems.push({ ...base, action: 'create' });
  });
  // A draft is not a part until the person approves it, so what the file brings counts for nothing here: a style or an animation that
  // needs one waits for it (the report says so), and importing again after approving it makes them.
  const known = (name: string): boolean => catalogNames.has(name);

  // The style: the same name and the same reference is the same style.
  const style = a.look?.style;
  if (style) {
    const base = { kind: 'style' as const, index: 0, label: style.name };
    const refKey = style.reference ? addressKey(style.reference) : '';
    const referenceKeyOf = (id: string | undefined): string => {
      const source = id ? current.references.find((r) => r.id === id)?.source : undefined;
      return source ? addressKey(source) : '';
    };
    const missing = style.parts.filter((n) => !known(n));
    const served = current.presets.find((p) => p.name === style.name && referenceKeyOf(p.referenceId) === refKey);
    if (served) items.push({ ...base, action: 'exists', presetId: served.id });
    else if ((current.localStyles ?? []).some((l) => l.name === style.name && (l.reference ? addressKey(l.reference) : '') === refKey)) items.push({ ...base, action: 'exists' });
    else if (missing.length > 0) items.push({ ...base, action: 'keep-local', reason: 'parts-missing', detail: missing });
    else if (usable) items.push({ ...base, action: 'create', base: { existing: usable.id } });
    else if (refKey && !existingRef) items.push({ ...base, action: 'create', base: { made: true } });
    else items.push({ ...base, action: 'keep-local', reason: 'no-ready-reference' });
  }

  items.push(...partItems);

  // The animation: the same song with the same design and script is the same animation; on another song it is always a new one.
  const label = a.title;
  const sceneNames = new Set(partItems.filter((i) => i.scene && i.action === 'create').map((i) => i.label));
  const scenes = sceneNames.size;
  const used = partsUsed(a.script).filter((n) => !known(n) && !sceneNames.has(n));
  const print = fingerprint(a.song, a.design, a.script);
  const animated = animatedParams(a.script);
  const dropAnimate = !!current.catalog && (animated.length > 0 || itemAnimatedParams(a.script).length > 0) && !hasAnimateFeature(current.catalog);
  const dropLayers = !!current.catalog && hasLayers(a.script) && !hasLayersFeature(current.catalog);
  if (!chosen) items.push({ kind: 'animation', index: 0, label, action: 'impossible', reason: 'song-missing', detail: [a.song.title] });
  // A file with scenes is always a new animation: its scenes are written for one piece, and another piece with the same script has other scenes.
  else if (!fitted && scenes === 0 && current.pieces.some((p) => fingerprint(p.source, p.design.design, p.script) === print)) items.push({ kind: 'animation', index: 0, label, action: 'exists' });
  else if (used.length > 0) items.push({ kind: 'animation', index: 0, label, action: 'impossible', reason: 'parts-missing', detail: used });
  else if (current.catalog && (dropLayers || dropAnimate)) {
    const drops: ('animate' | 'layers')[] = [...(dropAnimate ? ['animate' as const] : []), ...(dropLayers ? ['layers' as const] : [])];
    items.push({ kind: 'animation', index: 0, label, action: 'create', reason: dropLayers ? 'layers-unsupported' : 'animate-unsupported', detail: [...(dropLayers ? layerNames(a.script) : []), ...(dropAnimate ? [...animated, ...itemAnimatedParams(a.script)] : [])], drops });
  }
  else items.push({ kind: 'animation', index: 0, label, action: 'create', ...(fitted ? { reason: 'fitted' as const } : {}) });

  return { items, song: chosen, fitted, scenes };
}

/** The parameters of a script that change over their piece, as `p2: to` (an extra part: `p2 (pulse-ring): weight`), in the order of the script. */
export function animatedParams(script: Script): string[] {
  return script.pieces.flatMap((p) => [
    ...Object.keys(p.animate ?? {}).map((name) => `${p.id}: ${name}`),
    ...(p.with ?? []).flatMap((e) => Object.keys(e.animate ?? {}).map((name) => `${p.id} (${e.part}): ${name}`)),
  ]);
}

/** The lanes of a script, as `layer "strip"`, in order. */
export const layerNames = (script: Script): string[] => (script.layers ?? []).map((l) => `layer "${l.id}"`);

/** The keyframes of the items of the layers, as `layer "strip" item #2: to`. */
export function itemAnimatedParams(script: Script): string[] {
  return (script.layers ?? []).flatMap((l) => l.items.flatMap((it, n) => Object.keys(it.animate ?? {}).map((name) => `layer "${l.id}" item #${n + 1}: ${name}`)));
}

/** How many items there are of each action, to say it in one line. */
export function countPlan(plan: ImportPlan): Record<PlanAction, number> {
  const counts: Record<PlanAction, number> = { create: 0, exists: 0, 'keep-local': 0, impossible: 0 };
  for (const item of plan.items) counts[item.action] += 1;
  return counts;
}

const first = <T>(o: import('rxjs').Observable<T>): Promise<T> => firstValueFrom(o);

/**
 * Reads from the port only what this animation needs to be planned against: the songs and the catalog; the references and styles when
 * the file has a look; the drafts when it brings parts; and the details of the animations on the file's own song, to tell whether this
 * one is already there.
 */
export async function readCurrentState(port: AnimationPort, file: AnimationDataset, localStyles: CurrentState['localStyles'] = []): Promise<CurrentState> {
  const a = file.animation;
  const songs = await first(port.songs());
  const catalog = await first(port.catalog());
  const hasLook = a.look?.style !== undefined || a.look?.reference !== undefined;
  const references = hasLook ? await first(port.references()) : [];
  const presets = a.look?.style ? await first(port.presets()) : [];
  const drafts = (a.parts?.length ?? 0) > 0 ? await first(port.drafts()) : [];
  const pieces: PieceDetail[] = [];
  if (songs.some((s) => sameSong(s, a.song))) for (const summary of await first(port.pieces())) if (sameSong(summary.source, a.song)) pieces.push(await first(port.piece(summary.id)));
  return { songs, catalog, references, presets, drafts, pieces, localStyles };
}
