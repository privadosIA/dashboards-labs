// Pure model behind the phase strip: a left→right time lane per scene,
// derived exclusively from the event stream (docs/events.md). Consumers
// never assume a fixed set of phases — absent phases backfill as "n/a"
// once a later phase has run, which covers both silent scenes (no
// tts/probe events at all) and mode-skipped phases.
import { PipelineEvent } from '../../core/api.models';

export type SegState = 'pending' | 'running' | 'done' | 'cache' | 'failed' | 'stopped' | 'na';

export interface StripCell {
  phase: string;
  state: SegState;
  durationMs?: number;
}

export interface StripRow {
  sceneId: string;
  cells: StripCell[];
}

export interface StripModel {
  phases: string[];
  globalPhases: string[];
  rows: StripRow[];
  globalRow: StripRow | null;
  startedAt?: string;
  finished: boolean;
  failed: boolean;
  errorMessage?: string;
  finalArtifact?: string;
  totalDurationMs?: number;
  warnings: { sceneId?: string; message: string }[];
}

const VIDEO_PHASES = ['tts', 'probe', 'render', 'clip'];
const IMAGE_PHASES = ['render', 'export'];
const MUSIC_PHASES = ['compose', 'synth', 'export'];

/**
 * An error whose message starts with this prefix was emitted for a scene that
 * was cancelled because ANOTHER scene failed (parallel runs, docs/events.md):
 * it is shown as stopped, never as the cause.
 */
export const STOPPED_PREFIX = 'stopped:';

/**
 * Video phases of a run. `animate` (Wan) only runs for scenes that opt in, so
 * its column appears between render and clip only when the stream mentions
 * it; `motion` (the model writing the page of a motion graphic or an overlay)
 * comes first (the pages are written before the scene is made) only when it ran. A run without them looks exactly as
 * it always did.
 */
export function videoPhases(events: { phase?: string }[]): string[] {
  const phases = [...VIDEO_PHASES];
  if (events.some((e) => e.phase === 'animate')) {
    phases.splice(phases.indexOf('clip'), 0, 'animate');
  }
  if (events.some((e) => e.phase === 'motion')) {
    phases.unshift('motion');
  }
  return phases.length === VIDEO_PHASES.length ? VIDEO_PHASES : phases;
}

/**
 * Music phases of a run. `cover` (a picture for the song) only runs when the project asks for covers, so its column
 * appears between synth and export only when the stream mentions it.
 */
export function musicPhases(events: { phase?: string }[]): string[] {
  if (!events.some((e) => e.phase === 'cover')) {
    return MUSIC_PHASES;
  }
  const exportAt = MUSIC_PHASES.indexOf('export');
  return [...MUSIC_PHASES.slice(0, exportAt), 'cover', ...MUSIC_PHASES.slice(exportAt)];
}

/**
 * Phases the stream mentions that the mode's own list does not know, in the
 * order they first appear: a phase the server adds later is shown under its
 * raw name instead of being dropped.
 */
function unknownPhases(events: PipelineEvent[], known: string[], global: boolean): string[] {
  const extra: string[] = [];
  for (const e of events) {
    if (!e.phase || (e.scene_id === '_global') !== global) continue;
    if (!known.includes(e.phase) && !extra.includes(e.phase)) extra.push(e.phase);
  }
  return extra;
}

export function buildStrip(events: PipelineEvent[]): StripModel {
  // Music mode also exports, so it is told apart by its own phases: compose
  // (absent for a track that brings its own lyrics) and synth.
  // A music mix has its own row (its id) with a `mix` phase; the video's soundtrack mix is the `_global` one.
  const mixes = events.some((e) => e.phase === 'mix' && e.scene_id !== undefined && e.scene_id !== '_global');
  const musicMode = mixes || events.some((e) => e.phase === 'compose' || e.phase === 'synth');
  const imagesMode = !musicMode && events.some((e) => e.phase === 'export');
  const basePhases = musicMode ? (mixes ? [...musicPhases(events), 'mix'] : musicPhases(events)) : imagesMode ? IMAGE_PHASES : videoPhases(events);
  const baseGlobal = musicMode || imagesMode ? ['export'] : ['concat'];
  const phases = [...basePhases, ...unknownPhases(events, [...basePhases, ...baseGlobal], false)];
  const globalPhases = [...baseGlobal, ...unknownPhases(events, baseGlobal, true)];

  const sceneOrder: string[] = [];
  const cells = new Map<string, Map<string, StripCell>>();
  const cellOf = (scene: string, phase: string): StripCell => {
    if (!cells.has(scene)) {
      cells.set(scene, new Map());
      if (scene !== '_global') {
        sceneOrder.push(scene);
      }
    }
    const row = cells.get(scene)!;
    if (!row.has(phase)) {
      row.set(phase, { phase, state: 'pending' });
    }
    return row.get(phase)!;
  };

  const model: StripModel = {
    phases,
    globalPhases,
    rows: [],
    globalRow: null,
    finished: false,
    failed: false,
    warnings: [],
  };

  // With several GPUs the events of different scenes interleave, so the phase
  // in flight is tracked per scene.
  const inFlight = new Map<string, string>();

  for (const e of events) {
    switch (e.type) {
      case 'pipeline_start':
        model.startedAt = e.timestamp;
        break;
      case 'phase_start':
        if (e.scene_id && e.phase) {
          cellOf(e.scene_id, e.phase).state = 'running';
          inFlight.set(e.scene_id, e.phase);
        }
        break;
      case 'phase_end':
        if (e.scene_id && e.phase) {
          const c = cellOf(e.scene_id, e.phase);
          c.state = 'done';
          c.durationMs = e.duration_ms;
          if (inFlight.get(e.scene_id) === e.phase) {
            inFlight.delete(e.scene_id);
          }
        }
        break;
      case 'skipped':
        if (e.scene_id && e.phase) {
          cellOf(e.scene_id, e.phase).state = 'cache';
        }
        break;
      case 'warn':
        model.warnings.push({ sceneId: e.scene_id, message: e.message ?? '' });
        break;
      case 'error':
        model.failed = true;
        // The first error is the reason; later ones (scenes stopped by it)
        // must not replace it.
        model.errorMessage ??= e.message;
        if (e.scene_id && e.scene_id !== '_global') {
          const phase = inFlight.get(e.scene_id);
          if (phase) {
            cellOf(e.scene_id, phase).state = (e.message ?? '').startsWith(STOPPED_PREFIX)
              ? 'stopped'
              : 'failed';
            inFlight.delete(e.scene_id);
          }
        }
        break;
      case 'pipeline_end':
        model.finished = true;
        model.finalArtifact = e.artifact;
        model.totalDurationMs = e.duration_ms;
        break;
    }
  }

  for (const scene of sceneOrder) {
    const row: StripRow = { sceneId: scene, cells: [] };
    const sceneCells = cells.get(scene)!;
    // A phase with no event is "pending" until a LATER phase has state;
    // then it will never run (silent scene / mode skip) → n/a.
    let laterHasState = false;
    const resolved: StripCell[] = [];
    for (let i = phases.length - 1; i >= 0; i--) {
      const phase = phases[i];
      const cell = sceneCells.get(phase) ?? { phase, state: 'pending' as SegState };
      if (cell.state !== 'pending') {
        laterHasState = true;
      } else if (laterHasState) {
        cell.state = 'na';
      }
      resolved.unshift(cell);
    }
    row.cells = resolved;
    model.rows.push(row);
  }

  const globalCells = cells.get('_global');
  if (globalCells || model.rows.length > 0) {
    model.globalRow = {
      sceneId: '_global',
      cells: globalPhases.map(
        (phase) => globalCells?.get(phase) ?? { phase, state: 'pending' as SegState },
      ),
    };
  }
  return model;
}
