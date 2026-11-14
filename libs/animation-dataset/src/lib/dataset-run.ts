import { Observable, firstValueFrom } from 'rxjs';

import { AnimationFailure, type AnimationPort, type Draft, type Reference, clearAnimate, clearLayers } from '@lab/animation-core';
import type { AnimationDataset, FileStyle } from './dataset-file';
import type { ImportPlan, PlanItem, PlanKind, PlanReason } from './dataset-plan';
import { fitScript } from './fit-script';

/** What became of an item: made, already there, kept in the browser, refused, or left alone. */
export type ResultState = 'created' | 'exists' | 'kept-local' | 'failed' | 'skipped';

export interface ItemResult {
  readonly kind: PlanKind;
  /** The position in the file's list of own parts, for a part; 0 for the others. */
  readonly index: number;
  readonly label: string;
  readonly state: ResultState;
  /** The server's own words, when something failed. */
  readonly reason?: string;
  /** The planned reason, when the item was kept, or left alone, because of it. */
  readonly code?: PlanReason;
  /** For the animation that was made: its id, to open it. */
  readonly pieceId?: string;
  /** A part that is a scene brought with the animation. */
  readonly scene?: boolean;
}

export interface RunOptions {
  /** Stops before the next item; what was made stays and the rest is left alone. */
  readonly signal?: AbortSignal;
  /** How long, in all, the references and drafts are waited for. Ten minutes by default. */
  readonly waitMs?: number;
  /** How often a reference or a draft that is being worked on is read again. */
  readonly pollMs?: number;
  /** Keeps a style in the browser; `false` when the browser cannot hold one more. */
  readonly keepLocal: (style: FileStyle) => boolean;
  /** Called when the animation is made from a style kept in the browser, so its screen can say so and an export carries the look. */
  readonly startedFromLocal?: (pieceId: string, styleName: string) => void;
  /** Called with everything that has become of the items so far, each time one more does. */
  readonly onProgress?: (results: readonly ItemResult[]) => void;
  /** The person agreed that the animation is made without what the server does not take, its keyframes or its layers (the plan's `animate-unsupported` and `layers-unsupported`). Without it that animation is left alone. */
  readonly dropAnimate?: boolean;
}

export const DEFAULT_WAIT_MS = 10 * 60 * 1000;
export const DEFAULT_POLL_MS = 1500;

const first = <T>(o: Observable<T>): Promise<T> => firstValueFrom(o);
const reasonOf = (e: unknown): string => (e instanceof AnimationFailure ? e.reason : e instanceof Error ? e.message : String(e));

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/**
 * Reads again and again until `finished` says the thing is no longer being worked on; `null` if time is up, it is stopped or it cannot
 * be read. It reads the one thing instead of listening to the list, which an adapter need not send again as time goes by.
 */
async function waitUntil<T>(read: () => Observable<T>, finished: (t: T) => boolean, deadline: number, pollMs: number, signal?: AbortSignal): Promise<T | null> {
  for (;;) {
    if (signal?.aborted) return null;
    try {
      const value = await first(read());
      if (finished(value)) return value;
    } catch {
      return null;
    }
    const left = deadline - Date.now();
    if (left <= 0) return null;
    await sleep(Math.min(pollMs, left));
  }
}

/**
 * Makes what the plan says to make, in the order that respects what depends on what: the reference (waited for until it is analysed), the
 * style that starts from it, the own parts (as drafts, to be approved by the person) and the animation on the song the plan chose, which
 * is then given the file's design and script (fitted to the song when it is another one). A failure of one item changes nothing of the
 * others: when only the look fails the animation is still made. Importing the same file again makes nothing twice, because the plan sees
 * what is there. An animation whose design or script the server refuses is not left behind: the piece that was made for it is removed.
 */
export async function runAnimationImport(file: AnimationDataset, plan: ImportPlan, port: AnimationPort, options: RunOptions): Promise<ItemResult[]> {
  const a = file.animation;
  const results: ItemResult[] = [];
  const deadline = Date.now() + (options.waitMs ?? DEFAULT_WAIT_MS);
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const record = (item: PlanItem, state: ResultState, extra: { reason?: string; code?: PlanReason; pieceId?: string } = {}): void => {
    results.push({ kind: item.kind, index: item.index, label: item.label, state, ...(item.scene ? { scene: true } : {}), ...extra });
    options.onProgress?.([...results]);
  };
  const stopped = (item: PlanItem): boolean => {
    if (!options.signal?.aborted) return false;
    record(item, 'skipped');
    return true;
  };
  /** The items that are not made are settled at once, whatever the kind. */
  const settle = (item: PlanItem): boolean => {
    if (item.action === 'exists') return record(item, 'exists', item.reason ? { code: item.reason } : {}), true;
    if (item.action === 'impossible') return record(item, 'skipped', item.reason ? { code: item.reason } : {}), true;
    return false;
  };
  const itemOf = (kind: PlanKind): PlanItem | undefined => plan.items.find((i) => i.kind === kind);

  // The song only says where the animation goes.
  const songItem = itemOf('song');
  if (songItem) settle(songItem);

  // The reference: asked, then waited for.
  let referenceId: string | undefined;
  const referenceItem = itemOf('reference');
  if (referenceItem && !settle(referenceItem) && !stopped(referenceItem)) {
    const r = a.look?.reference;
    const url = r?.source ?? a.look?.style?.reference;
    try {
      referenceId = (await first(port.addReference({ url, title: r?.title, notes: r?.notes, tags: r?.tags }))).id;
    } catch (e) {
      record(referenceItem, 'failed', { reason: reasonOf(e) });
    }
  }
  let reference: Reference | null = null;
  const waitReference = async (id: string): Promise<Reference | null> => {
    if (reference?.id === id) return reference;
    reference = await waitUntil(() => port.reference(id), (r) => r.state !== 'analysing', deadline, pollMs, options.signal);
    return reference;
  };
  if (referenceItem && referenceId) {
    const found = await waitReference(referenceId);
    if (found?.state === 'ready') record(referenceItem, 'created');
    else record(referenceItem, 'failed', { reason: found?.error ?? (options.signal?.aborted ? undefined : found ? 'the analysis failed' : 'the analysis did not finish in time') });
  }

  // The style: made from a ready reference and then given the file's name, design, rhythm and parts; or kept in the browser.
  let presetId: string | undefined;
  let keptName: string | undefined;
  const styleItem = itemOf('style');
  const style = a.look?.style;
  if (styleItem && style) {
    const keep = (code: PlanReason | undefined, why?: string): void => {
      if (options.keepLocal(style)) {
        keptName = style.name;
        record(styleItem, 'kept-local', { ...(code ? { code } : {}), ...(why ? { reason: why } : {}) });
      } else record(styleItem, 'failed', { reason: why ?? 'the browser cannot keep one more style' });
    };
    if (styleItem.action === 'exists') presetId = styleItem.presetId;
    if (settle(styleItem) || stopped(styleItem)) {
      // settled above
    } else if (styleItem.action === 'keep-local') keep(styleItem.reason);
    else {
      const base = styleItem.base && 'existing' in styleItem.base ? styleItem.base.existing : referenceId;
      const ready = base ? await waitReference(base) : null;
      if (ready?.state !== 'ready') keep('no-ready-reference', ready?.error);
      else {
        try {
          const preset = await first(port.makePreset(ready.id, style.name));
          await first(port.savePreset(preset.id, { name: style.name, design: style.design, rhythm: style.rhythm, parts: style.parts }));
          presetId = preset.id;
          record(styleItem, 'created');
        } catch (e) {
          record(styleItem, 'failed', { reason: reasonOf(e) });
        }
      }
    }
  }

  // The own parts: a draft is asked from the request, waited for, and given the text of the file. Nothing is approved.
  // The scenes wait for the animation's piece: they belong to it.
  const sceneItems = plan.items.filter((i) => i.kind === 'part' && i.scene);
  for (const item of plan.items.filter((i) => i.kind === 'part' && !i.scene)) {
    if (settle(item) || stopped(item)) continue;
    const part = a.parts![item.index];
    try {
      const draft = await first(port.askDraft({ request: part.text?.request.trim() || part.description }));
      const written = await waitUntil<Draft>(() => port.draft(draft.id), (d) => d.state !== 'writing', deadline, pollMs, options.signal);
      if (written?.state !== 'ready') {
        record(item, 'failed', { reason: written?.error ?? (written ? 'the draft could not be written' : 'the draft was not written in time') });
        continue;
      }
      await first(port.saveDraft(draft.id, { manifest: part.text!.manifest, fragment: part.text!.fragment }));
      record(item, 'created');
    } catch (e) {
      record(item, 'failed', { reason: reasonOf(e) });
    }
  }

  // The animation: made on the chosen song with the file's options (and the style, when there is one), then given the design and the
  // script. On another song the script is fitted once the piece exists, because only then is that song's map known.
  const animation = itemOf('animation');
  if (animation && !settle(animation) && !stopped(animation)) {
    const unsupported = animation.reason === 'animate-unsupported' || animation.reason === 'layers-unsupported';
    if (unsupported && !options.dropAnimate) {
      record(animation, 'skipped', { code: animation.reason });
      for (const item of sceneItems) record(item, 'skipped');
      return results;
    }
    let bornId: string | undefined;
    try {
      const song = plan.song!;
      const born = await first(port.create(song, { ...a.options, ...(presetId ? { presetId } : {}) }));
      bornId = born.id;
      const fitted = plan.fitted ? fitScript(a.script, a.song.seconds, born.songMap, a.design) : a.script;
      const dropped = unsupported;
      const drops = animation.drops ?? ['animate'];
      let script = fitted;
      if (dropped && drops.includes('animate')) script = clearAnimate(script);
      if (dropped && drops.includes('layers')) script = clearLayers(script);
      script = await bringScenes(file, sceneItems, born.id, script, port, record);
      await first(port.saveDesign(born.id, a.design));
      await first(port.saveScript(born.id, script));
      if (keptName) options.startedFromLocal?.(born.id, keptName);
      record(animation, 'created', { pieceId: born.id, ...(dropped ? { code: animation.reason as 'animate-unsupported' | 'layers-unsupported' } : plan.fitted ? { code: 'fitted' as const } : {}) });
    } catch (e) {
      // The server makes the piece before it checks the design and the script: when it refuses them the empty piece is taken away, so
      // a file that cannot be imported leaves nothing behind. If even that fails, the reason given is still the first one.
      if (bornId) await first(port.remove(bornId)).catch(() => undefined);
      record(animation, 'failed', { reason: reasonOf(e) });
    }
  }
  // An animation that was not made leaves its scenes unmade: they belong to a piece.
  for (const item of sceneItems) if (!results.some((r) => r.kind === 'part' && r.index === item.index)) record(item, 'skipped');
  return results;
}

/**
 * Makes the scenes of the file for the piece that was just made: each is a draft from its own text (no assistant), approved at once, under a new name that carries the new piece
 * (`scene-<end of the piece id>-<n>`) with `scene.piece` set to the new piece, which the server requires to exist. The script's references to the old names are rewritten. A scene that
 * cannot be made stops the animation (the piece is removed by the caller): a script that points to a scene that is not there is not valid.
 */
async function bringScenes(file: AnimationDataset, items: readonly PlanItem[], pieceId: string, script: AnimationDataset['animation']['script'], port: AnimationPort, record: (item: PlanItem, state: ResultState, extra?: { reason?: string }) => void): Promise<typeof script> {
  const renames = new Map<string, string>();
  const tail = pieceId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-10);
  let n = 0;
  for (const item of items) {
    if (item.action !== 'create') {
      record(item, item.action === 'exists' ? 'exists' : 'skipped', item.reason ? { code: item.reason } as never : {});
      continue;
    }
    const part = file.animation.parts![item.index];
    const name = `scene-${tail}-${++n}`;
    try {
      const manifest = JSON.parse(part.text!.manifest) as { name: string; scene?: { piece: string; script_piece: string } };
      const text = { manifest: JSON.stringify({ ...manifest, name, scene: { ...manifest.scene, piece: pieceId } }, null, 2), fragment: part.text!.fragment };
      const draft = await first(port.createDraftFromText(text));
      if (draft.state !== 'ready') throw new Error(draft.problems.join('; ') || draft.error || 'the scene did not pass the checks');
      await first(port.approveDraft(draft.id));
      renames.set(part.name, name);
      record(item, 'created');
    } catch (e) {
      record(item, 'failed', { reason: reasonOf(e) });
      throw e;
    }
  }
  if (!renames.size) return script;
  const rename = (name: string): string => renames.get(name) ?? name;
  return { ...script, pieces: script.pieces.map((p) => ({ ...p, part: rename(p.part), ...(p.with ? { with: p.with.map((w) => ({ ...w, part: rename(w.part) })) } : {}) })) };
}

/** How many items ended in each state. */
export function countResults(results: readonly ItemResult[]): Record<ResultState, number> {
  const counts: Record<ResultState, number> = { created: 0, exists: 0, 'kept-local': 0, failed: 0, skipped: 0 };
  for (const r of results) counts[r.state] += 1;
  return counts;
}
