import { PipelineEvent } from '../../core/api.models';
import { buildStrip } from './strip-model';

const ev = (partial: Partial<PipelineEvent>): PipelineEvent =>
  ({ timestamp: 't', ...partial }) as PipelineEvent;

// The documented video fixture: a narrated scene with a cache hit on
// render, a silent scene (no tts/probe events at all), and the global
// concat (docs/events.md).
const VIDEO: PipelineEvent[] = [
  ev({ type: 'pipeline_start', timestamp: '2026-10-06T10:00:00Z' }),
  ev({ type: 'phase_start', scene_id: 'intro', phase: 'tts' }),
  ev({ type: 'phase_end', scene_id: 'intro', phase: 'tts', duration_ms: 2220, artifact: 'tmp/scene_intro.wav' }),
  ev({ type: 'phase_start', scene_id: 'intro', phase: 'probe' }),
  ev({ type: 'phase_end', scene_id: 'intro', phase: 'probe', duration_ms: 90 }),
  ev({ type: 'skipped', scene_id: 'intro', phase: 'render' }),
  ev({ type: 'phase_start', scene_id: 'intro', phase: 'clip' }),
  ev({ type: 'phase_end', scene_id: 'intro', phase: 'clip', duration_ms: 1800, artifact: 'tmp/scene_intro.mp4' }),
  ev({ type: 'warn', scene_id: '_global', message: 'free VRAM on GPU 1 is 1024 MB' }),
  // silent scene: render + clip only
  ev({ type: 'phase_start', scene_id: 'respiro', phase: 'render' }),
  ev({ type: 'phase_end', scene_id: 'respiro', phase: 'render', duration_ms: 18000 }),
  ev({ type: 'phase_start', scene_id: 'respiro', phase: 'clip' }),
];

describe('buildStrip', () => {
  it('maps the video fixture: done/cache/running per segment, left to right', () => {
    const m = buildStrip(VIDEO);
    expect(m.phases).toEqual(['tts', 'probe', 'render', 'clip']);
    const intro = m.rows[0];
    expect(intro.sceneId).toBe('intro');
    expect(intro.cells.map((c) => c.state)).toEqual(['done', 'done', 'cache', 'done']);
    expect(intro.cells[0].durationMs).toBe(2220);

    // Silent scene: tts/probe emitted nothing and render already ran → n/a.
    const respiro = m.rows[1];
    expect(respiro.cells.map((c) => c.state)).toEqual(['na', 'na', 'done', 'running']);

    expect(m.globalRow!.cells[0].phase).toBe('concat');
    expect(m.globalRow!.cells[0].state).toBe('pending');
    expect(m.warnings[0].message).toContain('VRAM');
    expect(m.finished).toBe(false);
  });

  it('completes on pipeline_end with artifact and total duration', () => {
    const m = buildStrip([
      ...VIDEO,
      ev({ type: 'phase_end', scene_id: 'respiro', phase: 'clip', duration_ms: 900 }),
      ev({ type: 'phase_start', scene_id: '_global', phase: 'concat' }),
      ev({ type: 'phase_end', scene_id: '_global', phase: 'concat', duration_ms: 1840, artifact: 'out/demo.mp4' }),
      ev({ type: 'pipeline_end', artifact: 'out/demo.mp4', duration_ms: 310010 }),
    ]);
    expect(m.finished).toBe(true);
    expect(m.finalArtifact).toBe('out/demo.mp4');
    expect(m.totalDurationMs).toBe(310010);
    expect(m.globalRow!.cells[0].state).toBe('done');
  });

  it('maps the images fixture: render + export columns, no narration lanes', () => {
    const m = buildStrip([
      ev({ type: 'pipeline_start' }),
      ev({ type: 'skipped', scene_id: 'hero', phase: 'render' }),
      ev({ type: 'phase_start', scene_id: 'hero', phase: 'export' }),
      ev({ type: 'phase_end', scene_id: 'hero', phase: 'export', duration_ms: 12, artifact: 'out/d/hero.png' }),
      ev({ type: 'phase_end', scene_id: '_global', phase: 'export', duration_ms: 8, artifact: 'out/d/manifest.json' }),
    ]);
    expect(m.phases).toEqual(['render', 'export']);
    expect(m.rows[0].cells.map((c) => c.state)).toEqual(['cache', 'done']);
    expect(m.globalRow!.cells[0].phase).toBe('export');
  });

  it('marks the running phase failed on an error event and carries the message', () => {
    const m = buildStrip([
      ev({ type: 'pipeline_start' }),
      ev({ type: 'phase_start', scene_id: 'intro', phase: 'render' }),
      ev({ type: 'error', scene_id: 'intro', message: 'render failed: CUDA out of memory' }),
    ]);
    expect(m.failed).toBe(true);
    expect(m.errorMessage).toContain('CUDA');
    const render = m.rows[0].cells.find((c) => c.phase === 'render')!;
    expect(render.state).toBe('failed');
  });

  // --- parallel runs (--gpu 0,1): events of different scenes interleave -------

  // cafe and pesca run at the same time on two GPUs. pesca fails while
  // animating; cafe, in the middle of its clip, is stopped because of it.
  const PARALLEL_FAILURE: PipelineEvent[] = [
    ev({ type: 'pipeline_start' }),
    ev({ type: 'phase_start', scene_id: 'cafe', phase: 'tts' }),
    ev({ type: 'phase_end', scene_id: 'cafe', phase: 'tts', duration_ms: 900 }),
    ev({ type: 'phase_start', scene_id: 'pesca', phase: 'tts' }),
    ev({ type: 'phase_end', scene_id: 'pesca', phase: 'tts', duration_ms: 900 }),
    ev({ type: 'phase_start', scene_id: 'cafe', phase: 'render' }),
    ev({ type: 'phase_end', scene_id: 'cafe', phase: 'render', duration_ms: 17000 }),
    ev({ type: 'phase_start', scene_id: 'pesca', phase: 'render' }),
    ev({ type: 'phase_end', scene_id: 'pesca', phase: 'render', duration_ms: 20000 }),
    ev({ type: 'phase_start', scene_id: 'cafe', phase: 'animate' }),
    ev({ type: 'phase_start', scene_id: 'pesca', phase: 'animate' }),
    // the last phase_start of the whole stream belongs to cafe...
    ev({ type: 'phase_start', scene_id: 'cafe', phase: 'clip' }),
    // ...but the failure belongs to pesca
    ev({ type: 'error', scene_id: 'pesca', message: 'animate failed: sd: out of memory' }),
    ev({ type: 'error', scene_id: 'cafe', message: 'stopped: animate failed: sd: out of memory' }),
  ];

  const cellState = (m: ReturnType<typeof buildStrip>, scene: string, phase: string) =>
    m.rows.find((r) => r.sceneId === scene)!.cells.find((c) => c.phase === phase)!.state;

  it('marks the failure on the scene that failed, not on the last one that started a phase', () => {
    const m = buildStrip(PARALLEL_FAILURE);
    expect(cellState(m, 'pesca', 'animate')).toBe('failed');
    expect(cellState(m, 'pesca', 'clip')).toBe('pending'); // never ran
  });

  it('shows a scene stopped by another scene as stopped, not as the cause', () => {
    const m = buildStrip(PARALLEL_FAILURE);
    expect(cellState(m, 'cafe', 'clip')).toBe('stopped');
    expect(cellState(m, 'cafe', 'animate')).toBe('running');
  });

  it('keeps the first error as the reason of the run', () => {
    const m = buildStrip(PARALLEL_FAILURE);
    expect(m.failed).toBe(true);
    expect(m.errorMessage).toBe('animate failed: sd: out of memory');
  });

  it('keeps the first error even when a stopped scene reports before it', () => {
    const m = buildStrip([
      ev({ type: 'phase_start', scene_id: 'a', phase: 'render' }),
      ev({ type: 'phase_start', scene_id: 'b', phase: 'render' }),
      ev({ type: 'error', scene_id: 'b', message: 'render failed: boom' }),
      ev({ type: 'error', scene_id: 'a', message: 'stopped: render failed: boom' }),
    ]);
    expect(m.errorMessage).toBe('render failed: boom');
    expect(cellState(m, 'a', 'render')).toBe('stopped');
    expect(cellState(m, 'b', 'render')).toBe('failed');
  });

  it('a scene waiting for resources (no phase in flight) is left alone by a stop', () => {
    const m = buildStrip([
      ev({ type: 'phase_start', scene_id: 'a', phase: 'render' }),
      ev({ type: 'phase_end', scene_id: 'a', phase: 'render', duration_ms: 5 }),
      ev({ type: 'error', scene_id: 'a', message: 'stopped: render failed: boom' }),
    ]);
    // nothing in flight for a: no cell is turned into stopped/failed
    expect(cellState(m, 'a', 'render')).toBe('done');
  });

  it('a sequential failure still marks that scene and carries its message', () => {
    const m = buildStrip([
      ev({ type: 'phase_start', scene_id: 'intro', phase: 'tts' }),
      ev({ type: 'phase_end', scene_id: 'intro', phase: 'tts', duration_ms: 1 }),
      ev({ type: 'phase_start', scene_id: 'intro', phase: 'render' }),
      ev({ type: 'error', scene_id: 'intro', message: 'render failed: boom' }),
    ]);
    expect(cellState(m, 'intro', 'render')).toBe('failed');
    expect(m.errorMessage).toBe('render failed: boom');
  });

  // --- the animate phase ------------------------------------------------------

  it('adds the animate column between render and clip when the stream animates', () => {
    const m = buildStrip([
      ev({ type: 'pipeline_start' }),
      ev({ type: 'phase_end', scene_id: 'cafe', phase: 'render', duration_ms: 17000 }),
      ev({ type: 'phase_start', scene_id: 'cafe', phase: 'animate' }),
      ev({ type: 'phase_end', scene_id: 'cafe', phase: 'animate', duration_ms: 84000, artifact: 'tmp/scene_cafe.anim.mp4' }),
      ev({ type: 'phase_start', scene_id: 'cafe', phase: 'clip' }),
      ev({ type: 'phase_end', scene_id: 'cafe', phase: 'clip', duration_ms: 300 }),
      // a scene that does not animate: render then clip
      ev({ type: 'phase_end', scene_id: 'lago', phase: 'render', duration_ms: 18000 }),
      ev({ type: 'phase_start', scene_id: 'lago', phase: 'clip' }),
    ]);
    expect(m.phases).toEqual(['tts', 'probe', 'render', 'animate', 'clip']);
    expect(m.rows[0].cells.find((c) => c.phase === 'animate')!.durationMs).toBe(84000);
    expect(cellState(m, 'lago', 'animate')).toBe('na');
  });

  it('adds the motion column first when the model wrote a page, and not otherwise', () => {
    const m = buildStrip([
      ev({ type: 'pipeline_start' }),
      ev({ type: 'phase_start', scene_id: 'gfx', phase: 'motion' }),
      ev({ type: 'phase_end', scene_id: 'gfx', phase: 'motion', duration_ms: 42000, artifact: 'motion/gfx.html' }),
      ev({ type: 'phase_end', scene_id: 'gfx', phase: 'render', duration_ms: 9000 }),
      ev({ type: 'phase_start', scene_id: 'gfx', phase: 'clip' }),
    ]);
    expect(m.phases).toEqual(['motion', 'tts', 'probe', 'render', 'clip']);
    expect(m.rows[0].cells.find((c) => c.phase === 'motion')!.durationMs).toBe(42000);
    expect(buildStrip([ev({ type: 'pipeline_start' }), ev({ type: 'phase_end', scene_id: 'a', phase: 'render', duration_ms: 1 })]).phases).toEqual(['tts', 'probe', 'render', 'clip']);
  });

  it('shows a running animation with its own state, not as a stalled scene', () => {
    const m = buildStrip([
      ev({ type: 'phase_end', scene_id: 'cafe', phase: 'render', duration_ms: 17000 }),
      ev({ type: 'phase_start', scene_id: 'cafe', phase: 'animate' }),
    ]);
    expect(cellState(m, 'cafe', 'animate')).toBe('running');
    expect(cellState(m, 'cafe', 'clip')).toBe('pending');
  });

  it('a cached animation is shown as reused from cache', () => {
    const m = buildStrip([
      ev({ type: 'skipped', scene_id: 'cafe', phase: 'render' }),
      ev({ type: 'skipped', scene_id: 'cafe', phase: 'animate' }),
      ev({ type: 'skipped', scene_id: 'cafe', phase: 'clip' }),
    ]);
    expect(cellState(m, 'cafe', 'animate')).toBe('cache');
  });

  it('keeps the original columns when the stream has no animate events', () => {
    expect(buildStrip(VIDEO).phases).toEqual(['tts', 'probe', 'render', 'clip']);
  });
});

describe('buildStrip: music mode', () => {
  const ev = (type: PipelineEvent['type'], scene_id: string | undefined, phase?: string, extra: Partial<PipelineEvent> = {}): PipelineEvent =>
    ({ timestamp: 't', type, scene_id, phase, ...extra });

  it('shows the cover column between synth and export only when the run makes covers', () => {
    const m = buildStrip([
      ev('pipeline_start', undefined),
      ev('phase_start', 'idea', 'synth'),
      ev('phase_end', 'idea', 'synth', { duration_ms: 2000 }),
      ev('phase_start', 'idea', 'cover'),
    ]);
    expect(m.phases).toEqual(['compose', 'synth', 'cover', 'export']);
  });

  it('shows compose, synth and export per track, told apart from images mode by compose/synth', () => {
    const m = buildStrip([
      ev('pipeline_start', undefined),
      ev('phase_start', 'idea', 'compose'),
      ev('phase_end', 'idea', 'compose', { duration_ms: 2000 }),
      ev('phase_start', 'idea', 'synth'),
    ]);
    expect(m.phases).toEqual(['compose', 'synth', 'export']);
    expect(m.globalPhases).toEqual(['export']);
    expect(m.rows.map((r) => r.sceneId)).toEqual(['idea']);
    expect(m.rows[0].cells.map((c) => c.state)).toEqual(['done', 'running', 'pending']);
  });

  it('shows compose as not applicable for a track that brings its own lyrics', () => {
    const m = buildStrip([
      ev('phase_start', 'ballad', 'synth'),
      ev('phase_end', 'ballad', 'synth', { duration_ms: 4000 }),
      ev('phase_start', 'ballad', 'export'),
      ev('phase_end', 'ballad', 'export'),
    ]);
    expect(m.rows[0].cells.map((c) => [c.phase, c.state])).toEqual([
      ['compose', 'na'],
      ['synth', 'done'],
      ['export', 'done'],
    ]);
  });

  it('shows a cached compose and synth as cache, and the global export step', () => {
    const m = buildStrip([
      ev('skipped', 'a', 'compose'),
      ev('skipped', 'a', 'synth'),
      ev('phase_start', '_global', 'export'),
      ev('phase_end', '_global', 'export', { duration_ms: 3 }),
    ]);
    expect(m.rows[0].cells.map((c) => c.state)).toEqual(['cache', 'cache', 'pending']);
    expect(m.globalRow?.cells[0].state).toBe('done');
  });

  it('keeps tracks apart when the events of several GPUs interleave', () => {
    const m = buildStrip([
      ev('phase_start', 'a', 'synth'),
      ev('phase_start', 'b', 'synth'),
      ev('phase_end', 'b', 'synth', { duration_ms: 5 }),
      ev('phase_end', 'a', 'synth', { duration_ms: 7 }),
    ]);
    expect(m.rows.map((r) => r.sceneId)).toEqual(['a', 'b']);
    expect(m.rows[0].cells[1].durationMs).toBe(7);
    expect(m.rows[1].cells[1].durationMs).toBe(5);
  });

  it('shows a failed synth and the stopped state of another track', () => {
    const m = buildStrip([
      ev('phase_start', 'a', 'synth'),
      ev('phase_start', 'b', 'synth'),
      ev('error', 'a', undefined, { message: 'synth failed: boom' }),
      ev('error', 'b', undefined, { message: 'stopped: synth failed: boom' }),
    ]);
    expect(m.rows[0].cells[1].state).toBe('failed');
    expect(m.rows[1].cells[1].state).toBe('stopped');
    expect(m.errorMessage).toBe('synth failed: boom');
  });

  it('is not triggered by an images run, which also exports', () => {
    const m = buildStrip([ev('phase_start', 'a', 'render'), ev('phase_end', 'a', 'render'), ev('phase_start', 'a', 'export')]);
    expect(m.phases).toEqual(['render', 'export']);
  });
});

describe('buildStrip: phases the view does not know', () => {
  const ev = (scene_id: string, phase: string): PipelineEvent => ({ timestamp: 't', type: 'phase_start', scene_id, phase });

  it('shows them under their raw name instead of dropping them', () => {
    const m = buildStrip([ev('a', 'render'), ev('a', 'upscale'), ev('_global', 'publish')]);
    expect(m.phases).toContain('upscale');
    expect(m.globalPhases).toContain('publish');
    expect(m.rows[0].cells.find((c) => c.phase === 'upscale')?.state).toBe('running');
  });

  it('adds nothing for streams that only use known phases', () => {
    const m = buildStrip([ev('a', 'tts'), ev('a', 'render')]);
    expect(m.phases).toEqual(['tts', 'probe', 'render', 'clip']);
    expect(m.globalPhases).toEqual(['concat']);
  });
});

describe('buildStrip: music mixes', () => {
  const ev = (type: PipelineEvent['type'], scene_id: string | undefined, phase?: string, extra: Partial<PipelineEvent> = {}): PipelineEvent =>
    ({ timestamp: 't', type, scene_id, phase, ...extra });

  it('adds a mix column to the music phases when a mix ran', () => {
    const m = buildStrip([
      ev('pipeline_start', undefined),
      ev('phase_start', 'base', 'synth'),
      ev('phase_end', 'base', 'synth', { duration_ms: 3000 }),
      ev('phase_start', 'final', 'mix'),
      ev('phase_end', 'final', 'mix', { duration_ms: 800 }),
    ]);
    expect(m.phases).toEqual(['compose', 'synth', 'export', 'mix']);
    expect(m.rows.map((r) => r.sceneId)).toEqual(['base', 'final']);
    expect(m.rows[1].cells.at(-1)?.state).toBe('done');
  });

  it('a run of one mix is still a music strip, not a video one', () => {
    const m = buildStrip([ev('pipeline_start', undefined), ev('phase_start', 'final', 'mix'), ev('skipped', 'solo', 'mix')]);
    expect(m.phases).toEqual(['compose', 'synth', 'export', 'mix']);
    expect(m.globalPhases).toEqual(['export']);
    expect(m.rows[0].cells.at(-1)?.state).toBe('running');
    expect(m.rows[1].cells.at(-1)?.state).toBe('cache');
  });

  it('a failed mix is reported on its row', () => {
    const m = buildStrip([ev('phase_start', 'final', 'mix'), ev('error', 'final', undefined, { message: 'clip 1: track "a" has no exported song yet' })]);
    expect(m.rows[0].cells.at(-1)?.state).toBe('failed');
    expect(m.errorMessage).toContain('no exported song yet');
  });
});

describe('buildStrip with background music', () => {
  it('shows the soundtrack and the mix after the concat, and stays a video strip', () => {
    const m = buildStrip([
      ev({ type: 'pipeline_start' }),
      ev({ type: 'phase_start', scene_id: 'intro', phase: 'tts' }),
      ev({ type: 'phase_end', scene_id: 'intro', phase: 'tts' }),
      ev({ type: 'phase_start', scene_id: '_global', phase: 'concat' }),
      ev({ type: 'phase_end', scene_id: '_global', phase: 'concat' }),
      ev({ type: 'skipped', scene_id: '_global', phase: 'bgm' }),
      ev({ type: 'phase_start', scene_id: '_global', phase: 'mix' }),
    ]);
    expect(m.phases).toEqual(['tts', 'probe', 'render', 'clip']);
    expect(m.globalPhases).toEqual(['concat', 'bgm', 'mix']);
    const cells = Object.fromEntries(m.globalRow!.cells.map((c) => [c.phase, c.state]));
    expect(cells).toMatchObject({ concat: 'done', bgm: 'cache', mix: 'running' });
  });
});
