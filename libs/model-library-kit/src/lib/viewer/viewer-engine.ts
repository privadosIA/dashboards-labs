import {
  AmbientLight,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  LoadingManager,
  type Material,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** What the viewer says about the model it loaded. */
export interface ViewerStats {
  readonly triangles: number;
  readonly meshes: number;
  readonly clips: readonly string[];
}

/** The colours the viewer draws with, as numbers (`0xrrggbb`): the host reads them from its tokens. */
export interface ViewerColors {
  readonly background: number;
  /** The tint the models are lit against: the sky light. */
  readonly sky: number;
  readonly ground: number;
}

/** The part of a renderer the engine uses, so that a spec can give one that draws nothing. */
export interface RendererLike {
  readonly domElement: HTMLCanvasElement;
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setClearColor(color: Color, alpha?: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
  forceContextLoss?(): void;
}

export interface ViewerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly colors: ViewerColors;
  /** `prefers-reduced-motion`: the camera does not glide to a stop. */
  readonly reducedMotion: boolean;
  /** Makes the renderer (the default is a `WebGLRenderer` on the canvas); a spec gives one that draws nothing. */
  readonly createRenderer?: (canvas: HTMLCanvasElement) => RendererLike;
}

/** The model could not be read: it is not a binary glTF three.js understands (the reason is the loader's). */
export class ModelUnreadable extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ModelUnreadable';
  }
}

/** Whether the browser can make a WebGL context at all (checked before a renderer is asked for). */
export function webglAvailable(doc: Document = document): boolean {
  try {
    const canvas = doc.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A loader's manager that answers every picture the model names in another file with the placeholder (data and blob addresses are the model's own and stay). */
function pictureless(): LoadingManager {
  const manager = new LoadingManager();
  manager.setURLModifier((url) => (/^(data|blob):/.test(url) ? url : PLACEHOLDER_PICTURE));
  return manager;
}

/** How many viewers are alive: a spec reads it to prove that closing one frees its renderer. */
let alive = 0;
export const liveViewers = (): number => alive;

const FOV = 40;

/** What stands for a picture a model names in another file: the server's model file does not carry them, and a request for one would be a 404 in the console. A plain mid-grey, so the model is shaded and not a white shape. */
const PLACEHOLDER_PICTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOYNnvBfwAGbQLRShaOcAAAAABJRU5ErkJggg==';

/**
 * Draws one model on a canvas: loads it from the bytes of a `.glb`, frames it, lets it be turned around, plays its clips and draws it as a wireframe. It knows nothing of Angular; the host drives it
 * (`frame` is what the animation loop calls) and must call `dispose` when it is done.
 */
export class ViewerEngine {
  private readonly renderer: RendererLike;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.01, 100);
  private readonly controls: OrbitControls;
  private readonly sky: HemisphereLight;
  private model?: Object3D;
  private mixer?: AnimationMixer;
  private clips: AnimationClip[] = [];
  private action?: AnimationAction;
  private chosen = '';
  private playing = false;
  private wire = false;
  private dirty = true;
  private disposed = false;
  private home = { position: new Vector3(0, 0, 3), target: new Vector3() };
  private readonly originalWire = new WeakMap<Material, boolean>();

  constructor(private readonly options: ViewerOptions) {
    alive++;
    this.renderer = (options.createRenderer ?? ((canvas) => new WebGLRenderer({ canvas, antialias: true, alpha: false })))(options.canvas);
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.sky = new HemisphereLight(options.colors.sky, options.colors.ground, 1.5);
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 4);
    // a softer light from the other side, so the side away from the sun is dim and not black
    const fill = new DirectionalLight(0xffffff, 0.7);
    fill.position.set(-4, 2, -3);
    this.scene.add(this.sky, sun, fill, new AmbientLight(0xffffff, 0.5));
    this.applyColors(options.colors);
    this.controls = new OrbitControls(this.camera, options.canvas);
    this.controls.enableDamping = !options.reducedMotion;
    this.controls.addEventListener('change', () => (this.dirty = true));
  }

  /** Reads a `.glb` and frames it; rejects with `ModelUnreadable` when it is not one three.js understands. */
  async load(bytes: ArrayBuffer): Promise<ViewerStats> {
    const gltf = await new Promise<{ scene: Object3D; animations: AnimationClip[] }>((resolve, reject) => {
      try {
        new GLTFLoader(pictureless()).parse(
          bytes,
          '',
          (g) => resolve(g),
          (e) => reject(new ModelUnreadable(e instanceof Error ? e.message : String((e as { message?: string }).message ?? e))),
        );
      } catch (e) {
        reject(new ModelUnreadable(e instanceof Error ? e.message : String(e)));
      }
    });
    if (this.disposed) {
      this.release(gltf.scene);
      throw new ModelUnreadable('closed');
    }
    this.clear();
    this.model = gltf.scene;
    this.scene.add(gltf.scene);
    this.clips = gltf.animations;
    this.mixer = gltf.animations.length ? new AnimationMixer(gltf.scene) : undefined;
    if (this.clips.length) this.choose(this.clips[0].name);
    this.setWireframe(this.wire);
    this.frameModel();
    this.dirty = true;
    return this.stats();
  }

  stats(): ViewerStats {
    let triangles = 0;
    let meshes = 0;
    this.model?.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      const g = mesh.geometry;
      triangles += (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
    });
    return { triangles: Math.round(triangles), meshes, clips: this.clips.map((c) => c.name) };
  }

  /** Chooses a clip (ready, not playing unless it was playing). */
  choose(name: string): void {
    const clip = this.clips.find((c) => c.name === name);
    if (!clip || !this.mixer) return;
    this.action?.stop();
    this.action = this.mixer.clipAction(clip);
    this.action.reset();
    this.chosen = name;
    if (this.playing) this.action.play();
    else {
      this.action.play();
      this.action.paused = true;
    }
    this.mixer.update(0);
    this.dirty = true;
  }

  get clipName(): string {
    return this.chosen;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  play(): void {
    if (!this.action) return;
    this.playing = true;
    this.action.paused = false;
  }

  pause(): void {
    if (!this.action) return;
    this.playing = false;
    this.action.paused = true;
    this.dirty = true;
  }

  /** The seconds the chosen clip has run (what the host shows). */
  get time(): number {
    return this.action?.time ?? 0;
  }

  setWireframe(on: boolean): void {
    this.wire = on;
    this.model?.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const material = m as Material & { wireframe?: boolean };
        if (!('wireframe' in material)) continue;
        if (!this.originalWire.has(material)) this.originalWire.set(material, !!material.wireframe);
        material.wireframe = on ? true : (this.originalWire.get(material) ?? false);
      }
    });
    this.dirty = true;
  }

  get wireframe(): boolean {
    return this.wire;
  }

  /** The camera goes back to the framing the model had when it loaded. */
  resetView(): void {
    this.camera.position.copy(this.home.position);
    this.controls.target.copy(this.home.target);
    this.controls.update();
    this.dirty = true;
  }

  /** Steps the camera by a fraction of the distance (the keyboard's way to zoom): positive goes closer. */
  zoom(fraction: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.multiplyScalar(1 - fraction);
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
    this.dirty = true;
  }

  /** Turns the camera about the model by angles in radians (the keyboard's way to orbit). */
  orbit(azimuth: number, polar: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const radius = offset.length();
    let theta = Math.atan2(offset.x, offset.z) + azimuth;
    let phi = Math.acos(Math.min(1, Math.max(-1, offset.y / radius))) + polar;
    phi = Math.min(Math.PI - 0.05, Math.max(0.05, phi));
    theta = theta % (Math.PI * 2);
    this.camera.position.set(this.controls.target.x + radius * Math.sin(phi) * Math.sin(theta), this.controls.target.y + radius * Math.cos(phi), this.controls.target.z + radius * Math.sin(phi) * Math.cos(theta));
    this.controls.update();
    this.dirty = true;
  }

  setColors(colors: ViewerColors): void {
    this.applyColors(colors);
    this.dirty = true;
  }

  resize(width: number, height: number): void {
    if (width < 1 || height < 1) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  /** One step of the loop: moves the clip on by `seconds` and draws when something changed. Returns whether it drew. */
  frame(seconds: number): boolean {
    if (this.disposed) return false;
    const moved = this.controls.update();
    if (this.playing && this.mixer) {
      this.mixer.update(seconds);
      this.dirty = true;
    }
    if (!this.dirty && !moved) return false;
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
    return true;
  }

  /** Frees the geometry, the textures, the controls and the rendering context; the engine is no use afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    alive--;
    this.mixer?.stopAllAction();
    this.controls.dispose();
    this.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }

  private applyColors(colors: ViewerColors): void {
    this.renderer.setClearColor(new Color(colors.background), 1);
    this.scene.background = new Color(colors.background);
    this.sky.color.setHex(colors.sky);
    this.sky.groundColor.setHex(colors.ground);
  }

  private clear(): void {
    if (this.model) {
      this.scene.remove(this.model);
      this.release(this.model);
    }
    this.model = undefined;
    this.mixer?.stopAllAction();
    this.mixer = undefined;
    this.action = undefined;
    this.clips = [];
    this.chosen = '';
    this.playing = false;
  }

  /** Disposes everything a model holds on the GPU: geometries, materials and every texture a material points at. */
  private release(root: Object3D): void {
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(m)) {
          const texture = value as { isTexture?: boolean; dispose?: () => void } | null;
          if (texture?.isTexture) texture.dispose?.();
        }
        m.dispose();
      }
    });
  }

  private frameModel(): void {
    if (!this.model) return;
    const box = new Box3().setFromObject(this.model);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.001) / 2;
    const distance = (radius / Math.tan((FOV * Math.PI) / 360)) * 1.35;
    this.camera.near = Math.max(distance / 1000, 0.001);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = distance * 0.1;
    this.controls.maxDistance = distance * 8;
    this.home = { position: new Vector3(center.x + distance * 0.55, center.y + distance * 0.35, center.z + distance * 0.8), target: center };
    this.resetView();
  }
}
