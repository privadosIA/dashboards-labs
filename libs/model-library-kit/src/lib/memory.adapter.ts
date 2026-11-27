import { type Observable, defer, of, throwError } from 'rxjs';

import { sampleGlb } from './viewer/sample-glb';

import {
  type BackendId,
  type BackendStatus,
  type CatalogPage,
  type CatalogQuery,
  type ContainerState,
  type Engines,
  type Generation,
  type GenerationRequest,
  type ImportRequest,
  type InstallJob,
  type InstallOptions,
  type InstallPlan,
  type LicenceTerms,
  type LibraryModel,
  LibraryFailed,
  type ModelBackend,
  type ModelCopy,
  type ModelFileStep,
  type ModelLibraryPort,
  type ModelPack,
  type ModelPlacePort,
  type PlacedFile,
} from './port';

/** A 1x1 grey picture: the thumbnail of the in-memory catalog. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const CLIPS = ['idle', 'walk', 'sprint', 'jump'];

interface Sample {
  readonly pack: Omit<ModelPack, 'state' | 'models' | 'tags'>;
  readonly models: readonly { name: string; tags: readonly string[]; clips: readonly string[]; triangles: number; needs: readonly string[] }[];
}

const kenney = (id: string, name: string, size: number): Sample['pack'] => ({
  id,
  name,
  author: 'Kenney',
  licence: 'CC0',
  attribution: false,
  source: 'catalog',
  page: `https://kenney.nl/assets/${id.replace('kenney-', '')}`,
  size_bytes: size,
});

const SAMPLES: readonly Sample[] = [
  {
    pack: kenney('kenney-mini-characters', 'Mini Characters', 4_900_000),
    models: ['character-female-a', 'character-male-a', 'character-robot'].map((name) => ({ name, tags: ['character'], clips: CLIPS, triangles: 940, needs: ['colormap.png'] })),
  },
  {
    pack: kenney('kenney-food-kit', 'Food Kit', 4_800_000),
    models: ['pizza', 'burger', 'cheese'].map((name) => ({ name, tags: ['food', 'prop'], clips: [], triangles: 160, needs: ['colormap.png'] })),
  },
  {
    pack: kenney('kenney-furniture-kit', 'Furniture Kit', 5_600_000),
    models: ['table', 'chair'].map((name) => ({ name, tags: ['furniture', 'prop'], clips: [], triangles: 210, needs: [] })),
  },
];

const WEIGHTS: Record<string, { files: string[]; bytes: number; licence: string; gated: boolean; path: string }> = {
  triposr: { files: ['triposr/config.yaml', 'triposr/model.ckpt'], bytes: 1_900_000_000, licence: 'MIT', gated: false, path: 'models/model3d/triposr' },
  sf3d: { files: ['sf3d/config.yaml', 'sf3d/model.safetensors', 'sf3d/160_tets.npz'], bytes: 3_900_000_000, licence: 'Stability AI Community License', gated: true, path: 'models/model3d/sf3d' },
};
/** The licence of each engine as the server describes it. sf3d's has an `id`: an install is refused until the request carries it as `accept_licence`. */
const LICENCES: Record<string, LicenceTerms> = {
  triposr: { name: 'MIT', url: 'https://huggingface.co/stabilityai/TripoSR', summary: 'Use, copy and change freely, keeping the notice.', commercial: 'yes' },
  sf3d: { id: 'stability-community', name: 'Stability AI Community License', url: 'https://huggingface.co/stabilityai/stable-fast-3d', summary: 'Free for personal use and for companies under a yearly revenue limit.', commercial: 'conditions' },
};
const VERSION: Record<string, string> = { triposr: 'triposr@3f1c9a2', sf3d: 'sf3d@8d41e07' };
const GB = 1e9;
/** What each way of running needs, in the order a person fixes it; what each part takes on the disk; the reason code and the words of each thing that can be missing. */
const NEEDS: Record<BackendId, readonly string[]> = { dotnet: ['service', 'weights'], docker: ['docker', 'image', 'gpu_runtime', 'weights'] };
/** The parts of an install by backend: the image (a `docker build`) is TripoSR's only; Stable Fast 3D's image is built by hand. */
const partsOf = (engine: string, backend: BackendId): readonly string[] => (backend === 'docker' ? (engine === 'sf3d' ? ['weights'] : ['image', 'weights']) : ['service', 'weights']);
const PART_ORDER = ['service', 'image', 'weights'] as const;
const SIZE: Record<string, Record<string, number>> = { triposr: { service: 0.3 * GB, image: 14 * GB, weights: 1.9 * GB }, sf3d: { service: 0.3 * GB, weights: 3.9 * GB } };
const REASON: Record<string, string> = { service: 'no_service', weights: 'no_weights', docker: 'no_docker', image: 'no_image', gpu_runtime: 'no_gpu_runtime' };
const DETAIL: Record<string, string> = { service: 'the .NET service is not published', weights: 'the weights are not downloaded', docker: 'Docker does not answer', image: 'the Docker image is not built', gpu_runtime: 'Docker has no NVIDIA runtime' };
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'model';

/** How the 3D service looks in memory: `none` (a server with no service: 503), `noservice` (neither the .NET service nor the weights), `bare` (the service but no weights), `running` (triposr already up) or the default (service and weights there, stopped, sf3d with no key). */
export type ServiceKind = 'none' | 'noservice' | 'bare' | 'running' | 'default';

/**
 * A library kept in memory for `?adapter=memory`, the examples build and the specs. The six steps of an install are taken one for each `pack(id)` it is asked for, so a view that polls sees it finish. A pack whose id is
 * `fails` ends `failed` once; a zip with `[none]` in its name has no models (422) and the licence is required (400), as the server asks.
 */
export class InMemoryModelLibrary implements ModelLibraryPort {
  private readonly packsById = new Map<string, ModelPack & { steps?: number }>();
  private readonly extra = new Map<string, readonly Sample['models'][number][]>();
  readonly calls: string[] = [];

  private readonly service: {
    parts: Record<string, Record<string, boolean>>;
    keys: Record<string, boolean>;
    /** Each engine's own service. */
    container: Record<string, { state: ContainerState['state']; reads: number }>;
    /** The saved `model3d_backend` (`''`: the default, the .NET service). */
    backend: string;
  };
  private readonly installs = new Map<string, InstallJob & { steps: number }>();
  /** The ids of the licences whose acceptance was recorded, as the server records one. */
  private readonly accepted = new Set<string>();
  private readonly gens = new Map<string, Generation & { steps: number; hasPrompt: boolean; adult: boolean }>();
  private readonly made: LibraryModel[] = [];
  private seq = 0;

  /** `docker: false` is a machine where Docker does not answer; `external: true` a service that `MODEL3D_HOST` names; `sf3dKey: true` a machine with the Hugging Face key saved, so sf3d can be installed (and its licence accepted). */
  constructor(private readonly options: { failing?: string; service?: ServiceKind; docker?: boolean; external?: boolean; modelFile?: 'missing'; sf3dKey?: boolean } = {}) {
    const kind = options.service ?? 'default';
    this.service = {
      parts: {
        triposr: { service: kind !== 'noservice', image: true, weights: kind !== 'bare' && kind !== 'noservice' },
        sf3d: { service: kind !== 'noservice', image: true, weights: false },
      },
      keys: { triposr: true, sf3d: options.sf3dKey === true },
      container: { triposr: { state: kind === 'running' ? 'running' : 'stopped', reads: 0 }, sf3d: { state: 'stopped', reads: 0 } },
      backend: '',
    };
    for (const s of SAMPLES) this.packsById.set(s.pack.id, { ...s.pack, state: 'available', models: 0, tags: [...new Set(s.models.flatMap((m) => m.tags))] });
  }

  private modelsOf(id: string): readonly Sample['models'][number][] {
    return SAMPLES.find((s) => s.pack.id === id)?.models ?? this.extra.get(id) ?? [];
  }

  private view(p: ModelPack & { steps?: number }): ModelPack {
    const { steps: _steps, ...pack } = p;
    return pack;
  }

  private get(id: string): ModelPack & { steps?: number } {
    const pack = this.packsById.get(id);
    if (!pack) throw new LibraryFailed(404, `pack "${id}" not found`);
    return pack;
  }

  /** The catalog of every installed pack, for the place port. */
  all(): LibraryModel[] {
    return [...this.packsById.values()]
      .filter((p) => p.state === 'installed')
      .flatMap((p) => this.modelsOf(p.id).map((m): LibraryModel => ({ id: `${p.id}/${m.name}`, pack: p.id, ...m, licence: p.licence, author: p.author, attribution: p.attribution, source: p.source })))
      .concat(this.made);
  }

  packs(): Observable<ModelPack[]> {
    return defer(() => {
      const list = [...this.packsById.values()].map((p) => this.view(p));
      if (this.made.length) list.push({ id: 'generated', name: 'Generated models', author: '', licence: 'the engine of each model', attribution: false, source: 'generated', size_bytes: this.made.length * 90_000, tags: [], state: 'installed', models: this.made.length });
      return of(list);
    });
  }

  pack(id: string): Observable<ModelPack> {
    return defer(() => {
      const pack = this.get(id);
      if (pack.state === 'installing') {
        pack.steps = (pack.steps ?? 0) + 1;
        if (pack.steps >= 6) {
          if (this.options.failing === id) {
            Object.assign(pack, { state: 'failed', error: 'the pack changed: nothing was installed (simulated)', progress: undefined });
          } else {
            Object.assign(pack, { state: 'installed', models: this.modelsOf(id).length, progress: undefined });
          }
        } else {
          Object.assign(pack, { progress: { done: Math.round((pack.steps / 6) * pack.size_bytes), total: pack.size_bytes } });
        }
      }
      return of(this.view(pack));
    });
  }

  install(id: string): Observable<ModelPack> {
    return defer(() => {
      this.calls.push(`install ${id}`);
      const pack = this.get(id);
      if (pack.state === 'installed' || pack.state === 'installing') return throwError(() => new LibraryFailed(409, `pack "${id}" is already ${pack.state}`));
      Object.assign(pack, { state: 'installing', steps: 0, progress: { done: 0, total: pack.size_bytes }, error: undefined });
      return of(this.view(pack));
    });
  }

  cancel(id: string): Observable<ModelPack> {
    return defer(() => {
      this.calls.push(`cancel ${id}`);
      const pack = this.get(id);
      if (pack.state !== 'installing') return throwError(() => new LibraryFailed(409, `pack "${id}" is not being installed`));
      Object.assign(pack, { state: 'available', steps: undefined, progress: undefined });
      return of(this.view(pack));
    });
  }

  remove(id: string): Observable<void> {
    return defer(() => {
      this.calls.push(`remove ${id}`);
      const pack = this.get(id);
      if (pack.state === 'installing') return throwError(() => new LibraryFailed(409, `pack "${id}" is being installed: cancel it first`));
      if (pack.source === 'user') {
        this.packsById.delete(id);
        this.extra.delete(id);
      } else {
        Object.assign(pack, { state: 'available', models: 0 });
      }
      return of(undefined);
    });
  }

  importPack(request: ImportRequest): Observable<ModelPack> {
    return defer(() => {
      this.calls.push(`import ${request.id}`);
      if (!request.licence.trim()) return throwError(() => new LibraryFailed(400, 'licence: say what the pack allows; it is required'));
      if (this.packsById.has(request.id)) return throwError(() => new LibraryFailed(409, `pack id "${request.id}" is already in use`));
      if (request.id.includes('none')) return throwError(() => new LibraryFailed(422, 'the zip has no .glb model: nothing was imported'));
      const models = [{ name: 'hero', tags: ['imported'], clips: ['idle'], triangles: 500, needs: [] as string[] }];
      this.extra.set(request.id, models);
      const pack: ModelPack = {
        id: request.id,
        name: request.name || request.id,
        author: request.author ?? '',
        licence: request.licence,
        attribution: !/^cc0/i.test(request.licence),
        source: 'user',
        size_bytes: request.file.size,
        tags: ['imported'],
        state: 'installed',
        models: models.length,
      };
      this.packsById.set(request.id, pack);
      return of(pack);
    });
  }

  catalog(query: CatalogQuery): Observable<CatalogPage> {
    return defer(() => {
      let list = this.all();
      const q = query.q?.trim().toLowerCase();
      if (q) list = list.filter((m) => m.name.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)) || (m.prompt ?? '').toLowerCase().includes(q));
      if (query.pack) list = list.filter((m) => m.pack === query.pack);
      if (query.tag) list = list.filter((m) => m.tags.includes(query.tag as string));
      if (query.hasClips) list = list.filter((m) => m.clips.length > 0);
      if (query.source) list = list.filter((m) => m.source === query.source);
      if (query.engine) list = list.filter((m) => m.engine === query.engine);
      if (query.project) list = list.filter((m) => m.project === query.project);
      const offset = query.offset ?? 0;
      return of({ models: list.slice(offset, offset + (query.limit ?? 24)), total: list.length });
    });
  }

  thumbnail(pack: string, name: string): Observable<Blob> {
    return defer(() => (this.all().some((m) => m.id === `${pack}/${name}`) ? of(new Blob([PNG], { type: 'image/png' })) : throwError(() => new LibraryFailed(404, `model "${pack}/${name}" not found`))));
  }

  file(pack: string, name: string): Observable<ModelFileStep> {
    return defer(() => {
      const found = this.all().find((m) => m.id === `${pack}/${name}`);
      if (!found || this.options.modelFile === 'missing') return throwError(() => new LibraryFailed(404, `model "${pack}/${name}" has no file here`));
      const bytes = sampleGlb(found.clips.slice(0, 8));
      return of({ loaded: 0, total: bytes.byteLength }, { loaded: bytes.byteLength, total: bytes.byteLength, bytes });
    });
  }

  // --- the engines, the download of their weights and the generations ---

  private noService(): boolean {
    return this.options.service === 'none';
  }

  private engineStatus(name: string): Engines[string] {
    const run = this.service.container[name];
    const container: ContainerState = { state: run.state };
    const backends = Object.fromEntries(this.backendsOf(name).map((b) => [b, this.backendStatus(name, b)]));
    if (this.options.external) return { available: true, mode: 'external', version: VERSION[name], container: { state: 'stopped' }, backends };
    if (name === 'sf3d' && !this.service.keys['sf3d']) return { available: false, mode: 'local', reason: 'key_missing', detail: 'no Hugging Face key is saved', container, backends };
    const status = backends[this.backendOf(name)];
    if (!status.available) return { available: false, mode: 'local', reason: status.reason, detail: status.detail, missing: status.missing, container, backends };
    if (container.state !== 'running') return { available: false, mode: 'local', reason: 'not_running', detail: container.state === 'starting' ? `the ${name} service is starting` : `the ${name} service is stopped`, container, backends };
    return { available: true, mode: 'local', version: VERSION[name], container, backends };
  }

  private dockerOk(): boolean {
    return this.options.docker !== false;
  }

  /** The ways an engine can run: the .NET service or the container, for both engines. */
  private backendsOf(_name: string): BackendId[] {
    return ['dotnet', 'docker'];
  }

  /** The one saved setting says it for both engines. */
  private backendOf(_name: string): BackendId {
    return this.service.backend === 'docker' ? 'docker' : 'dotnet';
  }

  private has(name: string, part: string): boolean {
    return part === 'docker' || part === 'gpu_runtime' ? this.dockerOk() : this.service.parts[name][part] === true;
  }

  private bytesOf(name: string, parts: readonly string[]): number {
    return parts.reduce((sum, p) => sum + (SIZE[name][p] ?? 0), 0);
  }

  private backendStatus(name: string, backend: BackendId): BackendStatus {
    const missing = NEEDS[backend].filter((p) => !this.has(name, p));
    if (!missing.length) return { available: true };
    const need = this.bytesOf(name, missing);
    return { available: false, missing, reason: REASON[missing[0]], detail: DETAIL[missing[0]], ...(need ? { need_bytes: Math.round(need) } : {}) };
  }

  engines(): Observable<Engines | null> {
    return defer(() => {
      if (this.noService()) return of(null);
      // a service that was started is up from the second time it is asked
      for (const run of Object.values(this.service.container)) if (run.state === 'starting' && ++run.reads >= 2) run.state = 'running';
      return of(Object.fromEntries(Object.keys(WEIGHTS).map((n) => [n, this.engineStatus(n)])) as Engines);
    });
  }

  startEngine(engine: string): Observable<ContainerState> {
    return defer(() => {
      this.calls.push(`start ${engine}`);
      if (!WEIGHTS[engine]) return throwError(() => new LibraryFailed(404, `engine "${engine}" is not known`));
      if (this.options.external) return throwError(() => new LibraryFailed(409, 'MODEL3D_HOST names a service elsewhere: it is managed where it runs'));
      const status = this.engineStatus(engine);
      if (!status.available && status.reason !== 'not_running') return throwError(() => new LibraryFailed(409, `engine "${engine}" cannot be used yet: ${status.reason}`, status.reason));
      const run = this.service.container[engine];
      if (run.state === 'stopped') Object.assign(run, { state: 'starting', reads: 0 });
      return of({ state: run.state });
    });
  }

  stopEngine(engine: string): Observable<ContainerState> {
    return defer(() => {
      this.calls.push(`stop ${engine}`);
      if (this.options.external) return throwError(() => new LibraryFailed(409, 'MODEL3D_HOST names a service elsewhere: it is managed where it runs'));
      this.service.container[engine].state = 'stopped';
      return of({ state: 'stopped' as const });
    });
  }

  modelBackend(): Observable<ModelBackend | null> {
    return defer(() => of(this.noService() ? null : { backend: this.backendOf('triposr'), source: this.service.backend ? ('setting' as const) : ('default' as const) }));
  }

  setModelBackend(value: BackendId | ''): Observable<ModelBackend> {
    return defer(() => {
      this.calls.push(`backend ${value || 'default'}`);
      if (value === 'docker' && !this.dockerOk()) return throwError(() => new LibraryFailed(422, 'Docker does not answer on this machine', 'no_docker'));
      if (this.options.external) return throwError(() => new LibraryFailed(409, 'MODEL3D_HOST names a service elsewhere: its backend is managed where it runs'));
      const starting = Object.keys(this.service.container).find((n) => this.service.container[n].state === 'starting');
      if (starting) return throwError(() => new LibraryFailed(409, `${starting} is starting: wait for it to be ready`));
      // what ran on the old backend is stopped
      if ((value || 'dotnet') !== (this.service.backend || 'dotnet')) for (const run of Object.values(this.service.container)) run.state = 'stopped';
      this.service.backend = value;
      return of({ backend: this.backendOf('triposr'), source: value ? ('setting' as const) : ('default' as const) });
    });
  }

  /** The licence of an engine, with `accepted` once an acceptance was recorded (only where one is required). */
  private termsOf(engine: string): LicenceTerms {
    const terms = LICENCES[engine];
    return terms.id ? { ...terms, accepted: this.accepted.has(terms.id) } : terms;
  }

  /** The plan: the backend, the parts it would run (those that are missing, in order, among those asked) and what they take. */
  private plan(engine: string, options: InstallOptions): { plan: InstallPlan } | { error: LibraryFailed } {
    const w = WEIGHTS[engine];
    if (!w) return { error: new LibraryFailed(404, `engine "${engine}" is not known`) };
    const backend = options.backend ?? this.backendOf(engine);
    if (backend === 'docker' && !this.dockerOk()) return { error: new LibraryFailed(422, 'Docker does not answer on this machine: it is not installed from here', 'no_docker') };
    const bad = options.parts?.find((p) => !partsOf(engine, backend).includes(p));
    if (bad !== undefined) return { error: new LibraryFailed(422, `parts: ${partsOf(engine, backend).join(' and ')} for ${backend}, not ${bad}`) };
    const parts = PART_ORDER.filter((p) => partsOf(engine, backend).includes(p) && !this.has(engine, p) && (!options.parts || options.parts.includes(p)));
    // the weights of sf3d need the saved key, for the .NET service too: refused before anything is downloaded
    if (engine === 'sf3d' && parts.includes('weights') && !this.service.keys['sf3d']) return { error: new LibraryFailed(422, 'engine "sf3d" cannot be installed now: key_missing', 'key_missing') };
    if (!parts.length) return { error: new LibraryFailed(409, `nothing is missing for ${engine} with the ${backend} backend`) };
    return { plan: { engine, backend, parts, missing: parts.includes('weights') ? w.files : [], bytes: Math.round(this.bytesOf(engine, parts)), licence: w.licence, licenceTerms: this.termsOf(engine), gated: w.gated, path: w.path, free_bytes: 214_000_000_000 } };
  }

  installPlan(engine: string, options: InstallOptions = {}): Observable<InstallPlan> {
    return defer(() => {
      const made = this.plan(engine, options);
      return 'error' in made ? throwError(() => made.error) : of(made.plan);
    });
  }

  startInstall(engine: string, options: InstallOptions = {}): Observable<InstallJob> {
    return defer(() => {
      this.calls.push(`install ${engine}${options.backend ? ` ${options.backend}` : ''}${options.parts ? ` ${options.parts.join('+')}` : ''}${options.acceptLicence ? ` accept:${options.acceptLicence}` : ''}`);
      const made = this.plan(engine, options);
      if ('error' in made) return throwError(() => made.error);
      // An engine whose licence has an id is never installed on the strength of the confirmation alone: the person's acceptance has to come with it, and the server records it.
      const needed = LICENCES[engine]?.id;
      if (needed && options.acceptLicence !== needed) return throwError(() => new LibraryFailed(400, `the licence ${needed} (${LICENCES[engine].name}, ${LICENCES[engine].url}) has to be accepted: send accept_licence after the person agreed`, 'licence_acceptance_required'));
      if ([...this.installs.values()].some((j) => j.state === 'running')) return throwError(() => new LibraryFailed(409, 'another install is running'));
      if (needed) this.accepted.add(needed);
      const parts = made.plan.parts ?? [];
      const job = { id: `m3d-install-${++this.seq}`, engine, backend: made.plan.backend, parts, part: parts[0], state: 'running' as const, log: [] as string[], created_at: new Date().toISOString(), steps: 0 };
      this.installs.set(job.id, job);
      return of(this.jobView(job));
    });
  }

  private jobView(job: InstallJob & { steps: number }): InstallJob {
    const { steps: _steps, ...rest } = job;
    return { ...rest, log: [...job.log] };
  }

  /** A part is taken at each ask: the job names the one that runs and, after the last, is done. */
  installJob(id: string): Observable<InstallJob> {
    return defer(() => {
      const job = this.installs.get(id);
      if (!job) return throwError(() => new LibraryFailed(404, `download "${id}" not found`));
      if (job.state === 'running') {
        const parts = job.parts ?? [];
        const finished = parts[job.steps];
        if (finished) this.service.parts[job.engine][finished] = true;
        job.steps++;
        Object.assign(job, { log: parts.slice(0, job.steps).map((p) => `${p}: done`), part: parts[job.steps] });
        if (job.steps >= parts.length) Object.assign(job, { state: 'done', part: undefined, finished_at: new Date().toISOString() });
      }
      return of(this.jobView(job));
    });
  }

  cancelInstall(id: string): Observable<InstallJob> {
    return defer(() => {
      const job = this.installs.get(id);
      if (!job) return throwError(() => new LibraryFailed(404, `download "${id}" not found`));
      if (job.state !== 'running') return throwError(() => new LibraryFailed(409, `download "${id}" is not running`));
      Object.assign(job, { state: 'cancelled', error: 'cancelled', finished_at: new Date().toISOString() });
      return of(this.jobView(job));
    });
  }

  generate(request: GenerationRequest): Observable<Generation> {
    return defer(() => {
      this.calls.push('generate');
      if (this.noService()) return throwError(() => new LibraryFailed(503, 'this server has no 3D service set up'));
      const hasPrompt = request.prompt !== undefined;
      if (hasPrompt && request.image) return throwError(() => new LibraryFailed(400, 'prompt: give a text or a picture, not both'));
      if (!hasPrompt && !request.image) return throwError(() => new LibraryFailed(400, 'prompt: give a text or a picture'));
      if (hasPrompt && (!request.prompt?.trim() || (request.prompt?.length ?? 0) > 1000)) return throwError(() => new LibraryFailed(400, 'prompt: a text that is not empty, up to 1000 characters'));
      if (request.image && request.image.size > 20 * 1024 * 1024) return throwError(() => new LibraryFailed(413, 'image: the picture is larger than 20 MB'));
      if (request.adult) return throwError(() => new LibraryFailed(422, 'adult content is not kept on this server'));
      const engine = request.engine ?? 'triposr';
      const status = this.engineStatus(engine);
      if (!status.available) return throwError(() => new LibraryFailed(503, `engine "${engine}" cannot be used now: ${status.reason}`, status.reason));
      const id = `api-m3d-${String(++this.seq).padStart(6, '0')}`;
      const gen = {
        id,
        client: 'unknown',
        state: 'queued' as const,
        ...(hasPrompt ? { prompt: request.prompt } : {}),
        engine,
        detail: request.detail ?? 'normal',
        name: request.name ?? slug(hasPrompt ? (request.prompt as string) : (request.image as File).name.replace(/\.[^.]*$/, '')),
        created_at: new Date(Date.now() + this.seq).toISOString(),
        run: `run-${id}`,
        steps: 0,
        hasPrompt,
        adult: false,
      };
      this.gens.set(id, gen);
      return of(this.genView(gen));
    });
  }

  private genView(g: Generation & { steps: number; hasPrompt: boolean; adult: boolean }): Generation {
    const { steps: _steps, hasPrompt: _hasPrompt, adult: _adult, ...rest } = g;
    return rest;
  }

  /** One step for each time a generation is asked for: queued, the picture (a text only), the model, done (or failed for a text with the word `fail`). */
  private advance(g: Generation & { steps: number; hasPrompt: boolean }): void {
    if (g.state === 'done' || g.state === 'failed' || g.state === 'cancelled') return;
    g.steps++;
    const picture = g.hasPrompt ? 1 : 0;
    if (g.steps <= 1) Object.assign(g, { state: 'queued', step: undefined });
    else if (g.steps === 2 && picture) Object.assign(g, { state: 'running', step: 'picture' });
    else if (g.steps <= 2 + picture) Object.assign(g, { state: 'running', step: 'model' });
    else if (/\bfail\b/i.test(g.prompt ?? '')) Object.assign(g, { state: 'failed', step: undefined, error: 'the engine ran out of memory making the model (simulated)', finished_at: new Date().toISOString() });
    else {
      let name = g.name;
      for (let n = 2; this.made.some((m) => m.name === name); n++) name = `${g.name}-${n}`;
      this.made.push({
        id: `generated/${name}`,
        pack: 'generated',
        name,
        tags: [],
        clips: [],
        triangles: 40_000,
        needs: [],
        licence: g.engine === 'sf3d' ? 'Stability AI Community License' : 'MIT',
        author: g.engine === 'sf3d' ? 'Stable Fast 3D' : 'TripoSR',
        attribution: g.engine === 'sf3d',
        source: 'generated',
        prompt: g.prompt ?? g.name,
        engine: g.engine,
        engine_version: VERSION[g.engine],
        generated_at: new Date().toISOString(),
        project: g.id,
        entry: name,
      });
      Object.assign(g, { state: 'done', step: undefined, model: `generated/${name}`, finished_at: new Date().toISOString() });
    }
  }

  generations(): Observable<Generation[]> {
    return defer(() => {
      for (const g of this.gens.values()) this.advance(g);
      return of([...this.gens.values()].map((g) => this.genView(g)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
    });
  }

  generation(id: string): Observable<Generation> {
    return defer(() => {
      const g = this.gens.get(id);
      if (!g) return throwError(() => new LibraryFailed(404, `generation "${id}" not found`));
      this.advance(g);
      return of(this.genView(g));
    });
  }

  cancelGeneration(id: string): Observable<Generation> {
    return defer(() => {
      const g = this.gens.get(id);
      if (!g) return throwError(() => new LibraryFailed(404, `generation "${id}" not found`));
      if (g.state !== 'queued' && g.state !== 'running') return throwError(() => new LibraryFailed(409, `generation "${id}" is already ${g.state}`));
      Object.assign(g, { state: 'cancelled', step: undefined, finished_at: new Date().toISOString() });
      return of(this.genView(g));
    });
  }

  deleteGeneration(id: string): Observable<void> {
    return defer(() => {
      this.calls.push(`delete generation ${id}`);
      return this.gens.delete(id) ? of(undefined) : throwError(() => new LibraryFailed(404, `generation "${id}" not found`));
    });
  }
}

/** The files of a place kept in memory (a project's sources or a piece), filled from a library like the server does: a model's pictures come as `<pack>--<picture>`; a name in use is a 409, and a file that is not a `.glb` or a picture is a 400. */
export class InMemoryModelPlace implements ModelPlacePort {
  private readonly files = new Map<string, PlacedFile & { from?: string }>();

  constructor(private readonly library: InMemoryModelLibrary) {}

  list(): Observable<PlacedFile[]> {
    return defer(() => of([...this.files.values()].sort((a, b) => (a.name < b.name ? -1 : 1)).map(({ from: _from, ...f }) => f)));
  }

  upload(name: string, file: Blob): Observable<void> {
    return defer(() => {
      if (!/\.(glb|png|jpe?g|webp)$/i.test(name)) return throwError(() => new LibraryFailed(400, `name: "${name}" is not accepted; use a .glb or a picture`));
      if (this.files.has(name)) return throwError(() => new LibraryFailed(409, `"${name}" already exists: a file is never replaced`));
      const isModel = /\.glb$/i.test(name);
      this.files.set(name, isModel ? { name, kind: 'model', size: file.size, clips: [], triangles: 0, needs: [] } : { name, kind: 'picture', size: file.size });
      return of(undefined);
    });
  }

  remove(name: string): Observable<void> {
    return defer(() => {
      if (!this.files.delete(name)) return throwError(() => new LibraryFailed(404, `"${name}" is not there`));
      return of(undefined);
    });
  }

  add(from: string, name?: string): Observable<ModelCopy> {
    return defer(() => {
      const found = this.library.all().find((m) => m.id === from);
      if (!found) return throwError(() => new LibraryFailed(404, `the library has no model "${from}" (is its pack installed?)`));
      const file = name ?? `${found.name}.glb`;
      const pictures = found.needs.map((n) => `${found.pack}--${n}`);
      const existing = this.files.get(file);
      if (existing && existing.from !== from) return throwError(() => new LibraryFailed(409, `"${file}" is already there and is another file: nothing was written`));
      for (const p of pictures) if (!this.files.has(p)) this.files.set(p, { name: p, kind: 'picture', size: 4096, from });
      if (existing) return of({ name: file, pictures, added: false });
      this.files.set(file, { name: file, kind: 'model', size: 60_000, clips: found.clips, triangles: found.triangles, needs: pictures, from });
      return of({ name: file, pictures, added: true });
    });
  }
}
