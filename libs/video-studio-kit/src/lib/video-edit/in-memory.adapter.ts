import { BehaviorSubject, Observable, Subject, Subscription, concat, defer, filter, map, of, takeWhile, throwError, timer } from 'rxjs';

import { isEditFinished, type EditToolInfo, type SettingSpec, type ToolId, type VideoEdit, type VideoEditRequest, type VideoEditResult } from './model';
import type { VideoEditPort } from './port';
import { VideoEditRefused, validateEdit } from './validate';

export interface InMemoryVideoEditOptions {
  /** Milliseconds each step lasts. 0 makes every step happen on the next tick. */
  pace?: number;
  /** How many steps an edit takes to get to 100. */
  steps?: number;
  /** The address a finished edit gets for its video. There is no real editing: by default it is the video that was sent. */
  videoUrl?: (request: VideoEditRequest) => string;
}

export class VideoEditNotFound extends Error {
  constructor(id: string) {
    super(`there is no video edit ${id}`);
    this.name = 'VideoEditNotFound';
  }
}

const choice = (name: string, values: (string | number)[], def: string | number): SettingSpec => ({ name, kind: 'choice', values, default: def });

/** The tools of demonstration: the adapter edits nothing, so these give the studio the same shapes and limits as the server. */
export const DEMO_TOOLS: readonly EditToolInfo[] = [
  { id: 'scale', name: 'Scale', description: 'Makes the video larger, keeping its sound.', available: true, needsImage: false, acceptsMotion: false, notes: [], settings: [choice('factor', [2, 4], 2), choice('engine', ['fast', 'quality'], 'fast')] },
  { id: 'interpolate', name: 'Frame rate', description: 'Adds frames so it moves more smoothly.', available: true, needsImage: false, acceptsMotion: false, notes: [], settings: [choice('fps', [24, 30, 60], 30)] },
  { id: 'reframe', name: 'Reframe', description: 'Changes the aspect ratio by cropping or padding.', available: true, needsImage: false, acceptsMotion: false, notes: [], settings: [choice('aspect_ratio', ['16:9', '9:16', '1:1', '4:5'], '16:9'), choice('mode', ['crop', 'pad'], 'crop'), { name: 'color', kind: 'color', default: '#000000' }] },
  { id: 'remove-background', name: 'Remove background', description: 'Cuts the people out.', available: true, needsImage: false, acceptsMotion: false, notes: ['Only human silhouettes'], settings: [{ name: 'background', kind: 'color', default: '#00ff00' }, { name: 'alpha', kind: 'boolean', default: false }] },
  { id: 'depth', name: 'Depth', description: 'A video of the depth of the scene.', available: false, reason: 'Demonstration only: it needs a server', needsImage: false, acceptsMotion: false, notes: [], settings: [] },
  { id: 'extend', name: 'Extend', description: 'Makes the video longer.', available: true, needsImage: false, acceptsMotion: false, notes: ['The quality drops with each extension'], settings: [{ name: 'seconds', kind: 'integer', min: 2, max: 10, default: 4 }, { name: 'prompt', kind: 'string', required: true }, choice('engine', ['minimax-h3', 'ltx'], 'minimax-h3')] },
  { id: 'motion-control', name: 'Motion Control', description: 'Moves the people of a picture like those of a video.', available: true, needsImage: true, acceptsMotion: true, notes: ['Only human silhouettes', '33 frames'], settings: [{ name: 'prompt', kind: 'string' }, { name: 'strength', kind: 'number', min: 0.2, max: 1, default: 0.6 }, { name: 'start', kind: 'number', min: 0, max: 30, default: 0 }] },
];

const KEEPS_SOUND: readonly ToolId[] = ['scale', 'reframe', 'remove-background'];

/** What a finished edit says it made, from the request alone (the same figures the mock gives). */
export function demoResult(request: VideoEditRequest, video: string): VideoEditResult {
  const s = request.settings;
  const alpha = request.tool === 'remove-background' && s['alpha'] === true;
  const factor = request.tool === 'scale' ? Number(s['factor'] ?? 2) : 1;
  return {
    video,
    format: alpha ? 'webm' : 'mp4',
    hasAudio: KEEPS_SOUND.includes(request.tool),
    width: 640 * factor,
    height: 360 * factor,
    fps: request.tool === 'interpolate' ? Number(s['fps'] ?? 30) : 24,
    duration: request.tool === 'extend' ? 5 + Number(s['seconds'] ?? 4) : 5,
    notes: [],
    ...(request.tool === 'scale' ? { engine: String(s['engine'] ?? 'fast') } : {}),
    ...(request.tool === 'extend' ? { extendedTimes: 1 } : {}),
  };
}

type Change = { id: string; edit: VideoEdit | null };

/**
 * A video edit port that edits nothing: each edit goes queued, running and done on its own, and its result is the video
 * that was sent. A prompt with `[fail]` ends failed. It keeps nothing once the page closes.
 */
export class InMemoryVideoEdit implements VideoEditPort {
  private readonly pace: number;
  private readonly steps: number;
  private readonly videoUrl: (request: VideoEditRequest) => string;
  private readonly edits = new BehaviorSubject<readonly VideoEdit[]>([]);
  private readonly changes = new Subject<Change>();
  private readonly timers = new Map<string, Subscription>();
  private counter = 0;

  constructor({ pace = 300, steps = 5, videoUrl = (r) => (r.video && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(r.video.blob) : '') }: InMemoryVideoEditOptions = {}) {
    this.pace = pace;
    this.steps = steps;
    this.videoUrl = videoUrl;
  }

  tools(): Observable<readonly EditToolInfo[]> {
    return of(DEMO_TOOLS);
  }

  list(): Observable<readonly VideoEdit[]> {
    return this.edits.asObservable();
  }

  create(request: VideoEditRequest): Observable<VideoEdit> {
    return defer(() => {
      const problems = validateEdit(request, DEMO_TOOLS);
      if (problems.length) return throwError(() => new VideoEditRefused(problems));
      const edit: VideoEdit = {
        id: `mem-edit-${++this.counter}`,
        tool: request.tool,
        settings: { ...request.settings },
        ...(request.motion ? { motion: request.motion } : {}),
        state: 'queued',
        progress: 0,
        createdAt: new Date().toISOString(),
      };
      this.put(edit);
      this.run(edit, request);
      return of(edit);
    });
  }

  remove(id: string): Observable<void> {
    return defer(() => {
      this.timers.get(id)?.unsubscribe();
      this.timers.delete(id);
      this.edits.next(this.edits.value.filter((e) => e.id !== id));
      this.changes.next({ id, edit: null });
      return of(undefined);
    });
  }

  follow(id: string): Observable<VideoEdit> {
    return defer(() => {
      const current = this.edits.value.find((e) => e.id === id);
      if (!current) return throwError(() => new VideoEditNotFound(id));
      return concat(
        of(current),
        this.changes.pipe(
          filter((c) => c.id === id),
          takeWhile((c): c is { id: string; edit: VideoEdit } => c.edit !== null),
          map((c) => c.edit),
        ),
      ).pipe(takeWhile((e) => !isEditFinished(e), true));
    });
  }

  private put(edit: VideoEdit): void {
    const rest = this.edits.value.filter((e) => e.id !== edit.id);
    const exists = rest.length !== this.edits.value.length;
    this.edits.next(exists ? this.edits.value.map((e) => (e.id === edit.id ? edit : e)) : [edit, ...rest]);
    this.changes.next({ id: edit.id, edit });
  }

  /** queued for one step, running for `steps` steps, then done (or failed when the prompt says so). */
  private run(edit: VideoEdit, request: VideoEditRequest): void {
    let current = edit;
    const fails = String(request.settings['prompt'] ?? '').includes('[fail]');
    this.timers.set(
      edit.id,
      timer(this.pace, this.pace).subscribe((tick) => {
        const n = tick + 1;
        if (n <= this.steps) {
          current = { ...current, state: 'running', progress: Math.min(99, Math.floor((n / (this.steps + 1)) * 100)) };
        } else {
          this.timers.get(edit.id)?.unsubscribe();
          this.timers.delete(edit.id);
          const { result: _r, error: _e, ...rest } = current;
          current = fails ? { ...rest, state: 'failed', error: 'Simulated failure: the model ran out of memory' } : { ...rest, state: 'done', progress: 100, result: demoResult(request, this.videoUrl(request)) };
        }
        this.put(current);
      }),
    );
  }
}
