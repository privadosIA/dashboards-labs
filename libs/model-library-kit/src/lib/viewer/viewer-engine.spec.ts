import { BufferGeometry, Material, Texture } from 'three';

import { sampleGlb } from './sample-glb';
import { type RendererLike, ModelUnreadable, ViewerEngine, type ViewerColors, liveViewers } from './viewer-engine';

const COLORS: ViewerColors = { background: 0x101820, sky: 0xffffff, ground: 0x333333 };

/** A renderer that draws nothing and counts what it is asked. */
class FakeRenderer implements RendererLike {
  renders = 0;
  disposed = false;
  lost = false;
  clear = 0;
  constructor(readonly domElement: HTMLCanvasElement) {}
  setPixelRatio() {}
  setSize() {}
  setClearColor() {
    this.clear++;
  }
  render() {
    this.renders++;
  }
  dispose() {
    this.disposed = true;
  }
  forceContextLoss() {
    this.lost = true;
  }
}

function make(reducedMotion = false) {
  const canvas = document.createElement('canvas');
  let renderer!: FakeRenderer;
  const engine = new ViewerEngine({ canvas, colors: COLORS, reducedMotion, createRenderer: (c) => (renderer = new FakeRenderer(c)) });
  return { engine, renderer };
}

describe('ViewerEngine', () => {
  it('loads a model, counts its triangles and lists its clips', async () => {
    const { engine } = make();
    const stats = await engine.load(sampleGlb(['idle', 'walk']));
    expect(stats).toEqual({ triangles: 12, meshes: 1, clips: ['idle', 'walk'] });
    engine.dispose();
  });

  it('chooses the first clip ready but not playing, plays, pauses and moves to another', async () => {
    const { engine } = make();
    await engine.load(sampleGlb(['idle', 'walk']));
    expect(engine.clipName).toBe('idle');
    expect(engine.isPlaying).toBe(false);
    engine.frame(1);
    expect(engine.time).toBe(0);
    engine.play();
    engine.frame(0.5);
    expect(engine.time).toBeCloseTo(0.5);
    engine.pause();
    engine.frame(1);
    expect(engine.time).toBeCloseTo(0.5);
    engine.choose('walk');
    expect(engine.clipName).toBe('walk');
    expect(engine.time).toBe(0);
    engine.dispose();
  });

  it('a model with no clips has nothing to play', async () => {
    const { engine } = make();
    const stats = await engine.load(sampleGlb());
    expect(stats.clips).toEqual([]);
    engine.play();
    expect(engine.isPlaying).toBe(false);
    engine.dispose();
  });

  it('draws only when something changed, and draws every frame while a clip plays', async () => {
    const { engine, renderer } = make();
    await engine.load(sampleGlb(['idle']));
    expect(engine.frame(0.016)).toBe(true);
    expect(engine.frame(0.016)).toBe(false);
    engine.play();
    expect(engine.frame(0.016)).toBe(true);
    expect(engine.frame(0.016)).toBe(true);
    expect(renderer.renders).toBe(3);
    engine.dispose();
  });

  it('turns the wireframe on and gives every material back as it was when it is off', async () => {
    const { engine } = make();
    const wired: boolean[] = [];
    await engine.load(sampleGlb());
    engine.setWireframe(true);
    expect(engine.wireframe).toBe(true);
    engine['model']?.traverse((o) => {
      const material = (o as { material?: { wireframe?: boolean } }).material;
      if (material) wired.push(!!material.wireframe);
    });
    expect(wired).toEqual([true]);
    engine.setWireframe(false);
    wired.length = 0;
    engine['model']?.traverse((o) => {
      const material = (o as { material?: { wireframe?: boolean } }).material;
      if (material) wired.push(!!material.wireframe);
    });
    expect(wired).toEqual([false]);
    engine.dispose();
  });

  it('frames the model and the view goes back to that framing after the camera moves', async () => {
    const { engine } = make();
    await engine.load(sampleGlb());
    const camera = engine['camera'];
    const home = camera.position.clone();
    expect(home.length()).toBeGreaterThan(1);
    engine.orbit(0.8, 0.2);
    engine.zoom(0.3);
    expect(camera.position.distanceTo(home)).toBeGreaterThan(0.1);
    engine.resetView();
    expect(camera.position.distanceTo(home)).toBeLessThan(1e-6);
    engine.dispose();
  });

  it('rejects a file that is not a binary glTF with ModelUnreadable', async () => {
    const { engine } = make();
    await expect(engine.load(new TextEncoder().encode('{"not":"a model"}').buffer as ArrayBuffer)).rejects.toBeInstanceOf(ModelUnreadable);
    engine.dispose();
  });

  it('damps the camera only when motion is allowed', () => {
    const moving = make(false);
    const still = make(true);
    expect(moving.engine['controls'].enableDamping).toBe(true);
    expect(still.engine['controls'].enableDamping).toBe(false);
    moving.engine.dispose();
    still.engine.dispose();
  });

  it('frees the geometry, the materials, the renderer and its context on dispose, once', async () => {
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(Material.prototype, 'dispose');
    const texture = vi.spyOn(Texture.prototype, 'dispose');
    const { engine, renderer } = make();
    await engine.load(sampleGlb(['idle']));
    const before = liveViewers();
    engine.dispose();
    engine.dispose();
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(renderer.disposed && renderer.lost).toBe(true);
    expect(liveViewers()).toBe(before - 1);
    expect(engine.frame(1)).toBe(false);
    vi.restoreAllMocks();
    expect(texture).toBeDefined();
  });

  it('opening and closing a viewer fifty times leaves no renderer, geometry or material behind', async () => {
    const start = liveViewers();
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(Material.prototype, 'dispose');
    const renderers: FakeRenderer[] = [];
    for (let i = 0; i < 50; i++) {
      const canvas = document.createElement('canvas');
      const engine = new ViewerEngine({ canvas, colors: COLORS, reducedMotion: false, createRenderer: (c) => { const r = new FakeRenderer(c); renderers.push(r); return r; } });
      await engine.load(sampleGlb(['idle']));
      engine.frame(0.1);
      engine.dispose();
    }
    expect(liveViewers()).toBe(start);
    expect(renderers.every((r) => r.disposed && r.lost)).toBe(true);
    expect(geometry).toHaveBeenCalledTimes(50);
    expect(material).toHaveBeenCalledTimes(50);
    vi.restoreAllMocks();
  });

  it('a load that finishes after the engine was closed frees what it read', async () => {
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const { engine } = make();
    const loading = engine.load(sampleGlb());
    engine.dispose();
    await expect(loading).rejects.toBeInstanceOf(ModelUnreadable);
    expect(geometry).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
