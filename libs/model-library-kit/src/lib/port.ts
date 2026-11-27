import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

/** A pack of 3D models: one of the server's list or one the person imported. */
export interface ModelPack {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly licence: string;
  /** Whether the licence asks for the author to be named. */
  readonly attribution: boolean;
  readonly source: 'catalog' | 'user' | 'generated';
  /** The page the pack comes from, when it has one (a Kenney pack's page asks for donations). */
  readonly page?: string;
  readonly version?: string;
  readonly size_bytes: number;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly state: 'available' | 'installing' | 'installed' | 'failed';
  /** Why a pack is `failed`, in the server's words. */
  readonly error?: string;
  /** Only while the pack is `installing`: the bytes of the zip downloaded so far and its size. */
  readonly progress?: { readonly done: number; readonly total: number };
  /** How many models it has when installed. */
  readonly models: number;
  readonly skipped?: readonly { readonly file?: string; readonly reason?: string }[];
}

/** A model of the catalog (an installed pack's). `id` is `<pack>/<name>`, what `from` takes. */
export interface LibraryModel {
  readonly id: string;
  readonly pack: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly clips: readonly string[];
  readonly triangles: number;
  readonly needs: readonly string[];
  /** For a generated model, its engine's licence. */
  readonly licence: string;
  readonly author: string;
  readonly attribution: boolean;
  /** Where it comes from. */
  readonly source?: ModelSource;
  /** Only for a generated model: the text it was made from (or the name of the picture). */
  readonly prompt?: string;
  readonly engine?: string;
  readonly engine_version?: string;
  readonly generated_at?: string;
  /** Only for a generated model made by a project or a generation: which one, and the name the entry gave it. */
  readonly project?: string;
  readonly entry?: string;
  /** Only for a generated model that was asked for as adult content. */
  readonly adult?: boolean;
}

export type ModelSource = 'catalog' | 'user' | 'generated';

/** What the catalog is asked for; every field is optional. */
export interface CatalogQuery {
  readonly q?: string;
  readonly pack?: string;
  readonly tag?: string;
  readonly hasClips?: boolean;
  readonly source?: ModelSource;
  readonly engine?: string;
  readonly project?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CatalogPage {
  readonly models: readonly LibraryModel[];
  readonly total: number;
}

/** A zip to import as a pack. `licence` is required: what the pack allows, in the person's words. */
export interface ImportRequest {
  readonly id: string;
  readonly licence: string;
  readonly name?: string;
  readonly author?: string;
  readonly sourceUrl?: string;
  readonly file: Blob;
}

/** What copying a model into a place answers: the file's name there and the pictures it brought, and whether anything was written (`false` when it was already there). */
export interface ModelCopy {
  readonly name: string;
  readonly pictures: readonly string[];
  readonly added: boolean;
}

/** A file of a place (a project's sources or a piece): a model with what was read of it, or a picture a model names. */
export interface PlacedFile {
  readonly name: string;
  readonly kind: 'model' | 'picture';
  readonly size: number;
  readonly clips?: readonly string[];
  readonly triangles?: number;
  readonly needs?: readonly string[];
}

/** The engines that make a model from a picture. */
export const ENGINES = ['triposr', 'sf3d'] as const;
export type EngineId = (typeof ENGINES)[number];
export const DETAILS = ['low', 'normal', 'high'] as const;
export type Detail = (typeof DETAILS)[number];

/** The container of the 3D service. */
export interface ContainerState {
  readonly state: 'stopped' | 'starting' | 'running';
  readonly error?: string;
}

/** The ways an engine can run: the .NET service of the server or the Docker container. */
export const BACKENDS = ['dotnet', 'docker'] as const;
export type BackendId = (typeof BACKENDS)[number];
/** What an install is made of, in the order it runs. */
export const PARTS = ['service', 'image', 'weights'] as const;
export type PartId = (typeof PARTS)[number];

/** One way of running an engine and what it lacks (`missing` are `service`, `weights`, `docker`, `image` or `gpu_runtime`). */
export interface BackendStatus {
  readonly available: boolean;
  readonly missing?: readonly string[];
  readonly reason?: string;
  readonly detail?: string;
  /** The disk the missing parts take (approximate); absent when nothing is missing. */
  readonly need_bytes?: number;
}

/** The backend an engine runs on, as the server's settings say it (`source` is `setting` when a person chose it, `default` otherwise). */
export interface ModelBackend {
  readonly backend: string;
  readonly source: 'setting' | 'default';
}

/** What an install is asked for: the backend to install for (default: the one in use) and the parts (default: all that are missing). */
export interface InstallOptions {
  readonly backend?: BackendId;
  readonly parts?: readonly PartId[];
  /** The `id` of the plan's licence, sent with the confirmation only after the person read the licence and agreed: the dashboard never sets it by itself. */
  readonly acceptLicence?: string;
}

/** A licence as the server describes it: show `name`, `commercial` and `summary`, link `url`. Where `id` is set the install is refused until the request carries it as `accept_licence`. */
export interface LicenceTerms {
  readonly id?: string;
  readonly name: string;
  readonly url?: string;
  readonly summary?: string;
  readonly commercial: 'yes' | 'conditions' | 'no' | 'unknown';
  /** An acceptance was recorded on the server; present only where one is required. */
  readonly accepted?: boolean;
}

/** Whether an engine can be used now and, if not, why (`reason` is the server's code, `detail` its words). */
export interface EngineStatus {
  readonly available: boolean;
  /** `external` is a service the server does not manage: it cannot be started, stopped or installed from here. */
  readonly mode?: 'local' | 'external';
  readonly reason?: string;
  readonly detail?: string;
  readonly missing?: readonly string[];
  readonly version?: string;
  readonly container?: ContainerState;
  /** For each way the engine can run: what it has and lacks. A server that has no backends for it sends none. */
  readonly backends?: Readonly<Record<string, BackendStatus>>;
}

/** The engines by id. */
export type Engines = Readonly<Record<string, EngineStatus>>;

/** What an engine's weights need before a download, so that the person reads it first. */
export interface InstallPlan {
  readonly engine: string;
  /** The way the install is for, and the parts it would run in order (older servers send neither). */
  readonly backend?: string;
  readonly parts?: readonly string[];
  readonly missing: readonly string[];
  readonly bytes: number;
  /** The licence's name. */
  readonly licence: string;
  /** The whole licence, from a server that sends it as an object (older ones send the name as text: this is absent then, and no acceptance is asked). */
  readonly licenceTerms?: LicenceTerms;
  /** The weights come from a repository whose licence the person's own Hugging Face account has to accept. */
  readonly gated: boolean;
  readonly path: string;
  readonly free_bytes: number;
}

/** A download of an engine's weights. */
export interface InstallJob {
  readonly id: string;
  readonly engine: string;
  readonly backend?: string;
  readonly parts?: readonly string[];
  /** The part that runs now. */
  readonly part?: string;
  readonly state: 'running' | 'done' | 'failed' | 'cancelled';
  readonly error?: string;
  /** What the download printed, one per step. */
  readonly log: readonly string[];
  readonly created_at: string;
  readonly finished_at?: string;
}

/** What a generation is asked with: a text or a picture (never both). */
export interface GenerationRequest {
  readonly prompt?: string;
  readonly image?: File;
  readonly engine?: EngineId;
  readonly detail?: Detail;
  readonly name?: string;
  readonly adult?: boolean;
}

/** One generation of a model. */
export interface Generation {
  readonly id: string;
  readonly client: string;
  readonly state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  /** Only while it runs: the picture of the text, or the model. */
  readonly step?: 'picture' | 'model';
  readonly prompt?: string;
  readonly engine: string;
  readonly detail: string;
  readonly name: string;
  /** `<pack>/<name>` in the library, once it is done. */
  readonly model?: string;
  readonly error?: string;
  readonly created_at: string;
  readonly finished_at?: string;
  readonly run: string;
}

/** How far the download of a model's file has got: the bytes that arrived, the size when the server said it, and the file itself in the last step. */
export interface ModelFileStep {
  readonly loaded: number;
  readonly total: number | null;
  readonly bytes?: ArrayBuffer;
}

/** Why an operation was refused: the status the server answered with and the words it gave (the views turn it into their own sentence). */
export class LibraryFailed extends Error {
  constructor(
    readonly status: number,
    /** The server's own words when it gave any. */
    readonly said = '',
    /** The server's code for why (`reason`) when it gave one: an engine that cannot be used says which part is missing. */
    readonly reason = '',
  ) {
    super(said || `status ${status}`);
    this.name = 'LibraryFailed';
  }
}

/** What the library screens need from the server: the packs and their install, the import of a zip, the catalog and its pictures. Every operation refuses with `LibraryFailed`. */
export interface ModelLibraryPort {
  packs(): Observable<ModelPack[]>;
  pack(id: string): Observable<ModelPack>;
  install(id: string): Observable<ModelPack>;
  cancel(id: string): Observable<ModelPack>;
  remove(id: string): Observable<void>;
  importPack(request: ImportRequest): Observable<ModelPack>;
  catalog(query: CatalogQuery): Observable<CatalogPage>;
  /** The picture of a model (a `503` is a `LibraryFailed`: the pack has no preview and Blender is missing). */
  thumbnail(pack: string, name: string): Observable<Blob>;

  /**
   * The model's `.glb` (`GET .../file`), step by step; unsubscribing cancels the download. A server that does not serve it yet answers `404`, which is a `LibraryFailed` with status 404
   * (the viewer then keeps the thumbnail and says so).
   */
  file(pack: string, name: string): Observable<ModelFileStep>;

  /** The engines that make models; `null` when the server has no 3D service (503): nothing about making models is then offered. */
  engines(): Observable<Engines | null>;
  /** Starts the container of the 3D service (`409` for an engine that lacks more than that, or an external service). */
  startEngine(engine: string): Observable<ContainerState>;
  stopEngine(engine: string): Observable<ContainerState>;
  /** The backend TripoSR runs on, from the server's settings; `null` when the server does not say (an older one). */
  modelBackend(): Observable<ModelBackend | null>;
  /** Chooses the backend (`''` goes back to the server's default). A refusal is a `LibraryFailed` (422: Docker does not answer; 409: an external service or one that is starting). */
  setModelBackend(value: BackendId | ''): Observable<ModelBackend>;
  /** What an install of an engine needs, for a backend and some parts; it changes nothing. */
  installPlan(engine: string, options?: InstallOptions): Observable<InstallPlan>;
  /** Starts the install: only after the person read the plan. */
  startInstall(engine: string, options?: InstallOptions): Observable<InstallJob>;
  installJob(id: string): Observable<InstallJob>;
  cancelInstall(id: string): Observable<InstallJob>;
  generate(request: GenerationRequest): Observable<Generation>;
  generations(): Observable<Generation[]>;
  generation(id: string): Observable<Generation>;
  cancelGeneration(id: string): Observable<Generation>;
  /** Removes the generation, not the model it made. */
  deleteGeneration(id: string): Observable<void>;
}

/**
 * Where models are kept and used: a project's sources, or a piece. A host gives one bound to the place it is showing; a host with no place (a request that has no project) gives none, and nothing of models is offered.
 */
export interface ModelPlacePort {
  /** Whether the server can keep models here at all (a server older than the library cannot): a host that is not sure yet says `false`, and nothing of models is offered until it says `true`. Absent means always. */
  readonly available?: () => boolean;
  list(): Observable<PlacedFile[]>;
  /** Uploads a `.glb` or a picture a model names (`409` for a name that exists, `400` for a file that is not usable). */
  upload(name: string, file: Blob): Observable<void>;
  remove(name: string): Observable<void>;
  /** Copies `from` (`<pack>/<model>`) with the pictures it needs. */
  add(from: string, name?: string): Observable<ModelCopy>;
}

export const MODEL_LIBRARY_PORT = new InjectionToken<ModelLibraryPort>('MODEL_LIBRARY_PORT');
export const MODEL_PLACE_PORT = new InjectionToken<ModelPlacePort>('MODEL_PLACE_PORT');
