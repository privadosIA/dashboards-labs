import { HttpClient, HttpContext, HttpEventType, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, filter, map, tap } from 'rxjs';

import { SKIP_ERROR_TOAST } from './api-error.interceptor';
import { ConnectionService } from '@lab/server-connection';
import { activeLang } from './language';
import { TicketService } from '@lab/server-connection';
import {
  AssetKind,
  MotionCatalogJson,
  ProjectEstimate,
  ProjectPatch,
  ProjectRestored,
  ProjectVersion,
  ProjectVersionText,
  AssetKindListing,
  AssistModelsResponse,
  AssistRequest,
  AssistResponse,
  DescribeModelsResponse,
  DescribeResult,
  AvailabilityResponse,
  OllamaTestResult,
  ProviderInfo,
  ProviderInput,
  ProviderTestResult,
  RoutingResponse,
  RoutingTask,
  SettingsResponse,
  ContainerState,
  EnginesResponse,
  HeartMulaTestResult,
  CacheReport,
  CatalogEntry,
  CivitaiResolve,
  ConfigResponse,
  DownloadRecord,
  DownloadRequest,
  EnvironmentReport,
  Finding,
  FindingRequest,
  ImagesManifest,
  LibraryPlaylist,
  LibraryPlaylistSummary,
  LibrarySong,
  LibrarySongsPage,
  LibrarySongsQuery,
  RescanResult,
  ImportMode,
  BlenderDescription,
  BlenderWritten,
  ImportPreview,
  KeptClip,
  MotionPage,
  MotionRevision,
  LaunchResponse,
  MusicAssistRequest,
  MusicAssistResponse,
  DictationResult,
  RequestPlan,
  MonitoringEntry,
  MonitoringRequest,
  MonitoringTestResult,
  MonitoringTool,
  DataCleanAnswer,
  DataImportAnswer,
  DataStatus,
  DatabaseRequest,
  DatabaseSettings,
  DatabaseTestResult,
  ListenResult,
  RecognizeMethod,
  RecognizeResult,
  Recognizer,
  MusicTagCategory,
  MusicTagCombo,
  RequestPlanBody,
  MusicGeneratorName,
  MeasureResult,
  SongAssistRequest,
  SongAssistResponse,
  TranscribeResult,
  MusicManifest,
  PeaksResponse,
  PictureUploadResult,
  ProjectStorage,
  ProjectSummary,
  Review,
  ReviewDetail,
  ReviewsDeleteRequest,
  ReviewSummary,
  ReviewTasksResult,
  Run,
  RunRequest,
  RunResources,
  RunsDeleteRequest,
  RunsDeleteResult,
  SourceInfo,
  StatsQuery,
  StatsResult,
  StorageCleanResult,
  StorageOverview,
  TokenService,
  PackageConfirmResult,
  PackageReport,
  VideoclipPlan,
  VideoclipPlanRequest,
  InstallJob,
  InstallPlan,
  InstallRequest,
  MusicBackend,
  LibraryModelInfo,
  LibraryModelsQuery,
  ModelEngineInfo,
  ModelGenerationInfo,
  ModelInstallInfo,
  ModelInstallPlanInfo,
  ModelInstallRequest,
  ModelCopyResult,
  ModelPackInfo,
} from './api.models';

/**
 * Thin typed client over the management API (docs/http-api.md). All
 * pipeline knowledge stays on the server; this only moves JSON.
 */
/** The generation API projects and the endpoint that deletes each kind. */
const MANAGED_DELETE: ReadonlyArray<readonly [string, string]> = [
  ['api-gen-', 'generations'],
  ['api-edit-', 'image-edits'],
  ['api-vid-', 'video-edits'],
];

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly conn = inject(ConnectionService);
  private readonly tickets = inject(TicketService);

  private get base(): string {
    return `${this.conn.server()}/api`;
  }

  // --- API description ----------------------------------------------------
  /** The server's OpenAPI document; the page explains failures itself. */
  openapi(): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.base}/openapi.json`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  // --- projects -----------------------------------------------------------
  listProjects(): Observable<ProjectSummary[]> {
    // `managed=include`: the videos and edits the other dashboards make through the generation API are projects too.
    return this.http.get<ProjectSummary[]>(`${this.base}/projects`, { params: { managed: 'include' } });
  }

  createProject(id: string): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/projects`, { id });
  }

  duplicateProject(id: string, newId: string): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/projects/${id}/duplicate`, {
      new_id: newId,
    });
  }

  /** Downloads a project: its scenes or songs as a dataset `veritmo import` reads, or a package with scenes.yaml and sources. */
  exportProject(id: string, format: 'dataset' | 'zip', lang: 'es' | 'en' = activeLang()): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.base}/projects/${id}/export?format=${format}&lang=${lang}`, { observe: 'response', responseType: 'blob' });
  }

  /** What a project package (the full export) brings and what this machine lacks. Creates nothing. */
  previewPackage(file: Blob, lang: 'es' | 'en' = activeLang()): Observable<PackageReport> {
    return this.http.post<PackageReport>(`${this.base}/import/package/preview?lang=${lang}`, file, { headers: { 'Content-Type': 'application/zip' } });
  }

  /** Creates the project of a package; missing models do not stop it. */
  confirmPackage(id: string, file: Blob, lang: 'es' | 'en' = activeLang()): Observable<PackageConfirmResult> {
    return this.http.post<PackageConfirmResult>(`${this.base}/import/package/confirm?id=${encodeURIComponent(id)}&lang=${lang}`, file, { headers: { 'Content-Type': 'application/zip' } });
  }

  /** The plan of the music video of a song (its shots, with the pictures written by the assistant when asked). Creates nothing. */
  videoclipPlan(projectId: string, req: VideoclipPlanRequest): Observable<VideoclipPlan> {
    return this.http.post<VideoclipPlan>(`${this.base}/projects/${projectId}/videoclip/plan`, req);
  }

  /** Creates the video project of a song from a video yaml whose soundtrack (`bgm.file`) is the song; the song is copied into its sources. */
  videoclipCreate(projectId: string, req: { track_id: string; variant?: number; id: string; yaml: string }): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/projects/${projectId}/videoclip`, req);
  }

  /** A generation API project (`api-gen-`, `api-edit-`, `api-vid-`) is deleted by its own endpoint; `DELETE /projects/{id}` refuses it. */
  deleteProject(id: string): Observable<void> {
    const own = MANAGED_DELETE.find(([prefix]) => id.startsWith(prefix));
    return this.http.delete<void>(own ? `${this.base}/${own[1]}/${id}` : `${this.base}/projects/${id}`);
  }

  /** Changes the name, the client or the adult label of a project by field; only what is sent changes. The dialog explains `409` and `422`. */
  patchProject(id: string, body: ProjectPatch): Observable<ProjectSummary> {
    return this.http.patch<ProjectSummary>(`${this.base}/projects/${encodeURIComponent(id)}`, body, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** The kept versions of a project's definition, newest first (the server keeps the 20 newest). */
  listProjectVersions(id: string): Observable<ProjectVersion[]> {
    return this.http.get<ProjectVersion[]>(`${this.base}/projects/${encodeURIComponent(id)}/versions`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** The text of one version. */
  getProjectVersion(id: string, version: number): Observable<ProjectVersionText> {
    return this.http.get<ProjectVersionText>(`${this.base}/projects/${encodeURIComponent(id)}/versions/${version}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Makes a version the definition of the project; what it replaces is kept as a new version. The dialog explains `409` and `422`. */
  restoreProjectVersion(id: string, version: number): Observable<ProjectRestored> {
    return this.http.post<ProjectRestored>(`${this.base}/projects/${encodeURIComponent(id)}/versions/${version}/restore`, {}, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  getConfig(id: string): Observable<ConfigResponse> {
    return this.http.get<ConfigResponse>(`${this.base}/projects/${id}/config`);
  }

  saveConfig(id: string, yaml: string): Observable<{ saved: boolean; warnings?: string[] }> {
    return this.http.put<{ saved: boolean; warnings?: string[] }>(
      `${this.base}/projects/${id}/config`,
      { yaml },
    );
  }

  getCache(id: string): Observable<CacheReport> {
    return this.http.get<CacheReport>(`${this.base}/projects/${id}/cache`);
  }

  // --- sources of music tasks --------------------------------------------------
  listSources(projectId: string): Observable<{ sources: SourceInfo[] }> {
    return this.http.get<{ sources: SourceInfo[] }>(`${this.base}/projects/${projectId}/sources`);
  }

  /** Uploads an audio file as a source. A taken name (409) is explained by the caller. */
  uploadSource(projectId: string, name: string, file: Blob): Observable<{ name: string }> {
    return this.http.put<{ name: string }>(
      `${this.base}/projects/${projectId}/sources/${encodeURIComponent(name)}`,
      file,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /**
   * Uploads the starting picture of a scene: a picture, or a GIF or video whose
   * first frame becomes the picture. The answer carries the generation settings
   * the file had, if any.
   */
  uploadPicture(projectId: string, name: string, file: Blob): Observable<PictureUploadResult> {
    return this.http.put<PictureUploadResult>(
      `${this.base}/projects/${projectId}/sources/${encodeURIComponent(name)}?as=picture`,
      file,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /**
   * Uploads a file of a request with its progress: emits the share sent (0 to 1) and, when the server has
   * answered, the name it stored (`as` picture: the starting picture of a scene; audio: a source). The caller
   * explains the errors.
   */
  uploadWithProgress(projectId: string, name: string, file: Blob, as: 'picture' | 'audio'): Observable<{ progress: number; name?: string }> {
    const q = as === 'picture' ? '?as=picture' : '';
    return this.http
      .put<{ name: string }>(`${this.base}/projects/${projectId}/sources/${encodeURIComponent(name)}${q}`, file, {
        observe: 'events',
        reportProgress: true,
        context: new HttpContext().set(SKIP_ERROR_TOAST, true),
      })
      .pipe(
        filter((e) => e.type === HttpEventType.UploadProgress || e.type === HttpEventType.Response),
        map((e) =>
          e.type === HttpEventType.UploadProgress
            ? { progress: e.total ? e.loaded / e.total : 0 }
            : { progress: 1, name: (e as HttpResponse<{ name: string }>).body?.name },
        ),
      );
  }

  /**
   * Adds the audio of a YouTube video as a source. Unsubscribing aborts the
   * request, which stops the download on the server. The caller explains errors.
   */
  addSourceFromUrl(projectId: string, url: string): Observable<{ name: string }> {
    return this.http.post<{ name: string }>(
      `${this.base}/projects/${projectId}/sources/from-url`,
      { url },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** Waveform peaks and the range with sound of a project audio (`sources/<name>` or `out/<project>/<name>`). */
  getPeaks(projectId: string, file: string, buckets?: number, bpm?: number): Observable<PeaksResponse> {
    let url = `${this.base}/projects/${projectId}/peaks?file=${encodeURIComponent(file)}`;
    if (buckets) url += `&buckets=${buckets}`;
    if (bpm) url += `&bpm=${bpm}`;
    return this.http.get<PeaksResponse>(url, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Integrated loudness (LUFS) of a project audio; `lufs` is null for silence. */
  getLoudness(projectId: string, file: string): Observable<{ lufs: number | null }> {
    const url = `${this.base}/projects/${projectId}/loudness?file=${encodeURIComponent(file)}`;
    return this.http.get<{ lufs: number | null }>(url, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Copies an exported song (`out/...`) as a source. */
  copySource(projectId: string, from: string, name?: string): Observable<{ name: string }> {
    return this.http.post<{ name: string }>(
      `${this.base}/projects/${projectId}/sources`,
      { from, ...(name ? { name } : {}) },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** Uploads a video a scene will use as its own clip. A taken name (409) is explained by the caller. */
  uploadClip(projectId: string, name: string, file: Blob): Observable<{ name: string }> {
    return this.http.put<{ name: string }>(
      `${this.base}/projects/${projectId}/sources/${encodeURIComponent(name)}?as=clip`,
      file,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** The clips the other projects kept for their scenes (`exclude` leaves one project out). */
  /** The stored page of a motion-graphic scene (or of its overlay) with its preview and how it was made. */
  getMotionPage(projectId: string, scene: string, overlay: boolean, duration?: number): Observable<MotionPage> {
    const q = [overlay ? 'overlay=1' : '', duration ? `duration=${duration}` : ''].filter(Boolean).join('&');
    return this.http.get<MotionPage>(`${this.base}/projects/${projectId}/scenes/${encodeURIComponent(scene)}/motion${q ? `?${q}` : ''}`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Replaces the stored page by hand. */
  saveMotionPage(projectId: string, scene: string, html: string, overlay: boolean): Observable<MotionPage> {
    return this.http.put<MotionPage>(`${this.base}/projects/${projectId}/scenes/${encodeURIComponent(scene)}/motion`, { html, overlay }, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Asks the model for a new page from the scene's saved description. */
  generateMotionPage(projectId: string, scene: string, overlay: boolean): Observable<MotionPage> {
    return this.http.post<MotionPage>(`${this.base}/projects/${projectId}/scenes/${encodeURIComponent(scene)}/motion/generate`, { overlay }, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Changes only the motion (the timeline block) of the stored page from a request in words; the answer replaces the page. */
  reviseMotionPage(projectId: string, scene: string, instruction: string, overlay: boolean): Observable<MotionRevision> {
    return this.http.post<MotionRevision>(`${this.base}/projects/${projectId}/scenes/${encodeURIComponent(scene)}/motion/revise`, { instruction, overlay }, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** A model writes the description of a 3D scene from an idea (`revise`: changes the stored one). The caller explains each refusal. */
  writeBlenderDescription(projectId: string, name: string, idea: string, seconds: number, revise: boolean): Observable<BlenderWritten> {
    return this.http.post<BlenderWritten>(`${this.base}/projects/${projectId}/blender/descriptions`, { name, idea, seconds, revise }, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** The stored description of a 3D scene. */
  getBlenderDescription(projectId: string, name: string): Observable<BlenderDescription> {
    return this.http.get<BlenderDescription>(`${this.base}/projects/${projectId}/blender/descriptions/${encodeURIComponent(name)}`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Saves a description written by hand, checked against a scene `seconds` long (a 400 names each fault by its place in the JSON). */
  saveBlenderDescription(projectId: string, name: string, description: Record<string, unknown>, seconds: number): Observable<BlenderDescription> {
    return this.http.put<BlenderDescription>(`${this.base}/projects/${projectId}/blender/descriptions/${encodeURIComponent(name)}`, { description, seconds }, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** One frame (PNG) of the stored description at second `t`, drawn on the server's CPU. */
  previewBlenderDescription(projectId: string, name: string, t: number, seconds: number, width?: number): Observable<Blob> {
    return this.http.post(`${this.base}/projects/${projectId}/blender/descriptions/${encodeURIComponent(name)}/preview`, { t, seconds, ...(width ? { width } : {}) }, {
      responseType: 'blob',
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  listKeptClips(exclude?: string, project?: string): Observable<{ clips: KeptClip[] }> {
    const params = [exclude ? `exclude=${encodeURIComponent(exclude)}` : '', project ? `project=${encodeURIComponent(project)}` : ''].filter(Boolean);
    const q = params.length ? `?${params.join('&')}` : '';
    return this.http.get<{ clips: KeptClip[] }>(`${this.base}/clips${q}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Copies the clip another project kept for a scene into this project's sources; the copy does not depend on it. */
  copyKeptClip(projectId: string, fromProject: string, scene: string, kind: 'clip' | 'animation' = 'clip'): Observable<{ name: string }> {
    return this.http.post<{ name: string }>(
      `${this.base}/projects/${projectId}/sources/clip`,
      { from_project: fromProject, scene, kind },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** Deletes one exported song (audio, cover and manifest entry) of a music project; `variant` is 0-based. */
  deleteSong(projectId: string, trackId: string, variant: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/projects/${projectId}/songs/${encodeURIComponent(trackId)}/${variant}`);
  }

  deleteSource(projectId: string, name: string): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/projects/${projectId}/sources/${encodeURIComponent(name)}`,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  // --- 3D model library (docs/MODEL_LIBRARY.md) -------------------------------------
  // The refusals are explained by the library's own views, so none of these raises the generic error toast.
  private readonly quiet = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });

  /** The packs the server lists and the ones imported, with their state. */
  listModelPacks(): Observable<{ packs: ModelPackInfo[] }> {
    return this.http.get<{ packs: ModelPackInfo[] }>(`${this.base}/models3d/packs`, this.quiet());
  }

  getModelPack(id: string): Observable<ModelPackInfo> {
    return this.http.get<ModelPackInfo>(`${this.base}/models3d/packs/${encodeURIComponent(id)}`, this.quiet());
  }

  /** Queues the install (202); the progress is read with `getModelPack`. */
  installModelPack(id: string): Observable<ModelPackInfo> {
    return this.http.post<ModelPackInfo>(`${this.base}/models3d/packs/${encodeURIComponent(id)}/install`, {}, this.quiet());
  }

  cancelModelPack(id: string): Observable<ModelPackInfo> {
    return this.http.post<ModelPackInfo>(`${this.base}/models3d/packs/${encodeURIComponent(id)}/cancel`, {}, this.quiet());
  }

  deleteModelPack(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/models3d/packs/${encodeURIComponent(id)}`, this.quiet());
  }

  /** Imports a zip as a pack; `licence` is required (the server keeps it and does not judge it). */
  importModelPack(params: { id: string; licence: string; name?: string; author?: string; source_url?: string }, zip: Blob): Observable<ModelPackInfo> {
    const query = new HttpParams({ fromObject: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')) as Record<string, string> });
    return this.http.post<ModelPackInfo>(`${this.base}/models3d/packs/import`, zip, { ...this.quiet(), params: query, headers: { 'Content-Type': 'application/zip' } });
  }

  /** The models of the installed packs; the page is in the query and the total in the body. */
  listLibraryModels(query: LibraryModelsQuery): Observable<{ models: LibraryModelInfo[]; total: number }> {
    const entries = Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== false);
    const params = new HttpParams({ fromObject: Object.fromEntries(entries.map(([k, v]) => [k, String(v)])) });
    return this.http.get<{ models: LibraryModelInfo[]; total: number }>(`${this.base}/models3d/models`, { ...this.quiet(), params });
  }

  /** The picture of a model (a 503 says the pack has none and Blender is not installed). */
  libraryModelThumbnail(pack: string, name: string): Observable<Blob> {
    return this.http.get(`${this.base}/models3d/models/${encodeURIComponent(pack)}/${encodeURIComponent(name)}/thumbnail`, { ...this.quiet(), responseType: 'blob' });
  }

  /**
   * The `.glb` of a model, saying how far it has got (`total` is `null` when the server did not give the size); the last step carries the body. A server that does not serve the route yet answers 404
   * (docs/server-request-model-file.md). Unsubscribing cancels the download.
   */
  libraryModelFile(pack: string, name: string): Observable<{ loaded: number; total: number | null; body?: Blob }> {
    return this.http
      .get(`${this.base}/models3d/models/${encodeURIComponent(pack)}/${encodeURIComponent(name)}/file`, { ...this.quiet(), responseType: 'blob', observe: 'events', reportProgress: true })
      .pipe(
        map((event) => {
          if (event.type === HttpEventType.DownloadProgress) return { loaded: event.loaded, total: event.total ?? null };
          if (event.type === HttpEventType.Response) return { loaded: event.body?.size ?? 0, total: event.body?.size ?? null, body: event.body as Blob };
          return null;
        }),
        filter((step): step is { loaded: number; total: number | null; body?: Blob } => step !== null),
      );
  }

  // --- the engines that make 3D models and their generations (docs/MODEL_GENERATION.md) ---

  /** The engines and whether each can be used; a server with no 3D service answers 503. */
  listModelEngines(): Observable<{ engines: Record<string, ModelEngineInfo> }> {
    return this.http.get<{ engines: Record<string, ModelEngineInfo> }>(`${this.base}/models3d/engines`, this.quiet());
  }

  startModelEngine(engine: string): Observable<{ container: { state: 'stopped' | 'starting' | 'running'; error?: string } }> {
    return this.http.post<{ container: { state: 'stopped' | 'starting' | 'running'; error?: string } }>(`${this.base}/models3d/engines/${encodeURIComponent(engine)}/start`, {}, this.quiet());
  }

  stopModelEngine(engine: string): Observable<{ container: { state: 'stopped' | 'starting' | 'running'; error?: string } }> {
    return this.http.post<{ container: { state: 'stopped' | 'starting' | 'running'; error?: string } }>(`${this.base}/models3d/engines/${encodeURIComponent(engine)}/stop`, {}, this.quiet());
  }

  /** Without `confirm` the plan of the install (nothing changes); with `confirm: true` the job (202). The backend and the parts are sent only when given. */
  modelEngineInstall(engine: string, confirm: boolean, request: ModelInstallRequest = {}): Observable<{ plan?: ModelInstallPlanInfo; install?: ModelInstallInfo }> {
    const body = { ...(request.backend ? { backend: request.backend } : {}), ...(request.parts ? { parts: request.parts } : {}), ...(confirm ? { confirm: true } : {}) };
    return this.http.post<{ plan?: ModelInstallPlanInfo; install?: ModelInstallInfo }>(`${this.base}/models3d/engines/${encodeURIComponent(engine)}/install`, body, this.quiet());
  }

  /** Saves how TripoSR runs (`'dotnet'`, `'docker'`; `''` goes back to the .NET service). The caller explains a 422 (Docker does not answer) or a 409 (an external service, or one that is starting). */
  putModel3dBackend(backend: 'dotnet' | 'docker' | ''): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(`${this.base}/settings`, { model3d_backend: backend }, this.quiet());
  }

  getModelInstall(id: string): Observable<ModelInstallInfo> {
    return this.http.get<ModelInstallInfo>(`${this.base}/models3d/installs/${encodeURIComponent(id)}`, this.quiet());
  }

  cancelModelInstall(id: string): Observable<ModelInstallInfo> {
    return this.http.post<ModelInstallInfo>(`${this.base}/models3d/installs/${encodeURIComponent(id)}/cancel`, {}, this.quiet());
  }

  /** Starts a generation from a text (JSON) or a picture (multipart: the picture is the `image` part and the other fields are text). 202. */
  createModelGeneration(fields: { prompt?: string; engine?: string; detail?: string; name?: string; client?: string; adult?: boolean }, image?: File): Observable<ModelGenerationInfo> {
    if (image) {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) if (v !== undefined && k !== 'prompt') form.append(k, String(v));
      form.append('image', image, image.name);
      return this.http.post<ModelGenerationInfo>(`${this.base}/models3d/generations`, form, this.quiet());
    }
    return this.http.post<ModelGenerationInfo>(`${this.base}/models3d/generations`, fields, this.quiet());
  }

  /** The generations, newest first. */
  listModelGenerations(): Observable<ModelGenerationInfo[]> {
    return this.http.get<ModelGenerationInfo[]>(`${this.base}/models3d/generations`, this.quiet());
  }

  getModelGeneration(id: string): Observable<ModelGenerationInfo> {
    return this.http.get<ModelGenerationInfo>(`${this.base}/models3d/generations/${encodeURIComponent(id)}`, this.quiet());
  }

  cancelModelGeneration(id: string): Observable<ModelGenerationInfo> {
    return this.http.post<ModelGenerationInfo>(`${this.base}/models3d/generations/${encodeURIComponent(id)}/cancel`, {}, this.quiet());
  }

  /** Removes the generation and its project, not the model it made. */
  deleteModelGeneration(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/models3d/generations/${encodeURIComponent(id)}`, this.quiet());
  }

  /** Copies a model of the library, with its pictures, into a project's sources: `201` when written, `200` when it was already there. */
  copyModelToProject(projectId: string, from: string, name?: string): Observable<HttpResponse<ModelCopyResult>> {
    return this.http.post<ModelCopyResult>(`${this.base}/projects/${projectId}/sources/model`, { from, ...(name ? { name } : {}) }, { ...this.quiet(), observe: 'response' });
  }

  // --- prompt assistant -----------------------------------------------------
  /**
   * Asks the local prompt assistant (Ollama on the CPU) for a prompt. It
   * takes 5-10 s and its failures (409 run in progress, 503 Ollama/model/
   * memory) are explained inline by the caller, so the generic error
   * snackbar is skipped for this request. Unsubscribing aborts it.
   */
  assist(task: AssistRequest['task'], text: string, model?: string): Observable<AssistResponse> {
    return this.http.post<AssistResponse>(
      `${this.base}/assist`,
      { task, text, ...(model ? { model } : {}) } satisfies AssistRequest,
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /**
   * Reads a recording of a spoken request on the server (Whisper, on the CPU). It takes a few
   * seconds and the caller explains its failures, so the error toast is skipped. Unsubscribing aborts it.
   */
  transcribe(recording: Blob, language?: string): Observable<DictationResult> {
    const q = language ? `?language=${encodeURIComponent(language)}` : '';
    return this.http.post<DictationResult>(`${this.base}/transcribe${q}`, recording, {
      headers: { 'Content-Type': 'application/octet-stream' },
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /**
   * Listens to a recording of a song that is playing and says what kind of song it is (its tempo, its key, its style and
   * what it is about; never its lyrics). It takes tens of seconds (Whisper and the model, on the CPU) and the caller
   * explains its failures, so the error toast is skipped. Unsubscribing aborts it.
   */
  listenSong(recording: Blob, language?: string, method?: RecognizeMethod): Observable<ListenResult> {
    const params = new URLSearchParams();
    if (language) params.set('language', language);
    if (method && method !== 'whisper') params.set('method', method);
    const q = params.size > 0 ? `?${params}` : '';
    return this.http.post<ListenResult>(`${this.base}/assist/listen${q}`, recording, {
      headers: { 'Content-Type': 'application/octet-stream' },
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /**
   * Turns a free-form request into its kind, title and the texts that kind needs. It takes tens of
   * seconds (the model runs on the CPU) and the caller explains its failures.
   */
  planRequest(body: RequestPlanBody): Observable<RequestPlan> {
    return this.http.post<RequestPlan>(`${this.base}/assist/request`, body, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /**
   * Speaks a text with an installed voice (Piper, on the CPU) and returns the WAV, to hear a narration
   * before a run. The error toast is skipped: the caller shows the reason; unsubscribing aborts it.
   */
  speechPreview(text: string, voice: string, speed: number, speaker = 0): Observable<Blob> {
    return this.http.post(
      `${this.base}/tts/preview`,
      { text, voice, speed, ...(speaker ? { speaker } : {}) },
      { responseType: 'blob', context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /**
   * Reads a picture or clip already in the project's sources with a local vision
   * model and returns its prompt. The error toast is skipped (the caller explains
   * refusals); unsubscribing aborts the request and the server unloads the model.
   */
  describe(project: string, source: string, model?: string, detail?: boolean, split?: boolean, provider?: string): Observable<DescribeResult> {
    return this.http.post<DescribeResult>(
      `${this.base}/describe`,
      { project, source, ...(model ? { model } : {}), ...(detail ? { detail } : {}), ...(split ? { split } : {}), ...(provider ? { provider } : {}) },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** Which optional music engines can be used now (HeartMuLa: a local container or a configured external service). */
  getMusicEngines(stats = false): Observable<EnginesResponse> {
    return this.http.get<EnginesResponse>(`${this.base}/music/engines${stats ? '?stats=1' : ''}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Starts the container of a music generator on a card (the one with most free memory when `gpu` is not given). */
  startMusicEngine(engine: string, gpu?: number): Observable<{ container: ContainerState }> {
    return this.http.post<{ container: ContainerState }>(`${this.base}/music/engines/${engine}/start`, gpu === undefined ? {} : { gpu }, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  stopMusicEngine(engine: string): Observable<{ container: ContainerState }> {
    return this.http.post<{ container: ContainerState }>(`${this.base}/music/engines/${engine}/stop`, {}, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Saves how a generator runs (`''` removes the choice: the default, the .NET service). Only this key is sent. */
  putMusicBackend(engine: 'heartmula' | 'diffrhythm2', backend: MusicBackend | ''): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(`${this.base}/settings`, { [`${engine}_backend`]: backend }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** What an install would do: the parts that are missing, their sizes, the licences and the disk. It changes nothing. */
  planInstall(engine: string, body: InstallRequest = {}): Observable<InstallPlan> {
    return this.http.post<InstallPlan>(`${this.base}/music/engines/${engine}/install`, { ...body, confirm: false }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Starts the install the plan described, after the person confirmed it (and the licences in it). */
  startInstall(engine: string, body: InstallRequest = {}): Observable<{ install: InstallJob }> {
    return this.http.post<{ install: InstallJob }>(`${this.base}/music/engines/${engine}/install`, { ...body, confirm: true }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  listInstalls(): Observable<{ installs: InstallJob[] }> {
    return this.http.get<{ installs: InstallJob[] }>(`${this.base}/music/installs`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  getInstall(id: string): Observable<{ install: InstallJob }> {
    return this.http.get<{ install: InstallJob }>(`${this.base}/music/installs/${id}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  cancelInstall(id: string): Observable<{ install: InstallJob }> {
    return this.http.post<{ install: InstallJob }>(`${this.base}/music/installs/${id}/cancel`, {}, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Saves the address (and token) of an external HeartMuLa service; an empty host removes it. `accept` records that lyrics may leave this machine. */
  putHeartMula(body: { host?: string; token?: string; accept?: boolean }): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(
      `${this.base}/settings`,
      { heartmula_host: body.host, heartmula_token: body.token, heartmula_accept: body.accept },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  testHeartMula(host?: string, token?: string): Observable<HeartMulaTestResult> {
    return this.http.post<HeartMulaTestResult>(`${this.base}/settings/heartmula/test`, { host, token }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** The same for the DiffRhythm2 service: its address, token and acceptance, and a test of it. */
  putDiffRhythm2(body: { host?: string; token?: string; accept?: boolean }): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(
      `${this.base}/settings`,
      { diffrhythm2_host: body.host, diffrhythm2_token: body.token, diffrhythm2_accept: body.accept },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  testDiffRhythm2(host?: string, token?: string): Observable<HeartMulaTestResult> {
    return this.http.post<HeartMulaTestResult>(`${this.base}/settings/diffrhythm2/test`, { host, token }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** The server's settings: the Ollama address in use and where it comes from. */
  getSettings(): Observable<SettingsResponse> {
    return this.http.get<SettingsResponse>(`${this.base}/settings`);
  }

  /** Saves the Ollama address ('' removes the setting). The caller explains a 400. */
  putOllamaHost(ollamaHost: string): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(
      `${this.base}/settings`,
      { ollama_host: ollamaHost },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** Saves the path of the Chrome or Chromium that draws motion graphics ('' goes back to searching the PATH). The caller explains a 400. */
  putBrowser(browser: string): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(`${this.base}/settings`, { browser }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Saves the model that writes motion-graphic pages ('' goes back to the assistant's). The caller explains a 400. */
  putMotionModel(model: string): Observable<SettingsResponse> {
    return this.http.put<SettingsResponse>(`${this.base}/settings`, { motion_model: model }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Asks the Ollama at `host` (default: the one in use) for its version and models; saves nothing. */
  testOllama(host?: string): Observable<OllamaTestResult> {
    return this.http.post<OllamaTestResult>(
      `${this.base}/settings/ollama/test`,
      host ? { host } : {},
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** The model providers: the built-in Ollama first, then the saved ones. */
  getProviders(): Observable<{ providers: ProviderInfo[] }> {
    return this.http.get<{ providers: ProviderInfo[] }>(`${this.base}/providers`);
  }

  /** Adds a provider. The caller explains a 400. */
  createProvider(body: ProviderInput): Observable<ProviderInfo> {
    return this.http.post<ProviderInfo>(`${this.base}/providers`, body, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Edits a saved provider. `key` absent leaves the key, '' removes it. */
  updateProvider(id: string, body: ProviderInput): Observable<ProviderInfo> {
    return this.http.put<ProviderInfo>(`${this.base}/providers/${encodeURIComponent(id)}`, body, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  deleteProvider(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/providers/${encodeURIComponent(id)}`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Lists the provider's models; saves nothing. */
  testProvider(id: string): Observable<ProviderTestResult> {
    return this.http.post<ProviderTestResult>(`${this.base}/providers/${encodeURIComponent(id)}/test`, {}, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Which provider runs each task, whether the user consented to a remote one, and the call cap. */
  getRouting(): Observable<RoutingResponse> {
    return this.http.get<RoutingResponse>(`${this.base}/routing`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /**
   * Routes tasks to providers (`ollama` puts a task back on the built-in one). A remote provider
   * needs `acknowledge_remote: true`, given only after the user accepted the consent dialog.
   * The caller explains a 400.
   */
  putRouting(body: { routing?: Partial<Record<RoutingTask, string>>; acknowledge_remote?: boolean; max_calls?: number }): Observable<RoutingResponse> {
    return this.http.put<RoutingResponse>(`${this.base}/routing`, body, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Which model tasks can run now: the provider of each is reachable and has the model it needs. */
  getAvailability(): Observable<AvailabilityResponse> {
    return this.http.get<AvailabilityResponse>(`${this.base}/models/availability`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** The vision models installed in Ollama, the default one and the detailed one. */
  describeModels(): Observable<DescribeModelsResponse> {
    return this.http.get<DescribeModelsResponse>(`${this.base}/describe/models`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** The chat models installed in Ollama, with their size and whether they fit the free memory. */
  assistModels(): Observable<AssistModelsResponse> {
    return this.http.get<AssistModelsResponse>(`${this.base}/assist/models`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** The tags HeartMuLa is asked for, by category (the list the server validates the assistant's answer against) and the popular combinations. */
  getMusicTags(): Observable<{ categories: MusicTagCategory[]; combos: MusicTagCombo[] }> {
    return this.http.get<{ categories: MusicTagCategory[]; combos: MusicTagCombo[] }>(`${this.base}/assist/music-tags`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /**
   * Asks the assistant for the style and lyrics of a song. Like the other task,
   * its failures are explained by the caller and unsubscribing aborts it.
   */
  assistMusic(text: string, instrumental: boolean, model?: string, generator?: MusicGeneratorName): Observable<MusicAssistResponse> {
    const body: MusicAssistRequest = {
      task: 'music',
      text,
      ...(instrumental ? { instrumental: true } : {}),
      ...(generator && generator !== 'ace-step' ? { generator } : {}),
      ...(model ? { model } : {}),
    };
    return this.http.post<MusicAssistResponse>(`${this.base}/assist`, body, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Reads the lyrics of an audio or video of the project's sources with Whisper, on the server's CPU. */
  transcribeSource(projectId: string, source: string, language?: string): Observable<TranscribeResult> {
    return this.http.post<TranscribeResult>(
      `${this.base}/projects/${projectId}/transcribe`,
      { source, ...(language ? { language } : {}) },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  getMonitoring(): Observable<{ tools: MonitoringEntry[] }> {
    return this.http.get<{ tools: MonitoringEntry[] }>(`${this.base}/settings/monitoring`);
  }

  /** Saves the address of a tool (an empty one removes it). The caller explains a failure. */
  putMonitoring(tool: MonitoringTool, body: MonitoringRequest): Observable<{ tools: MonitoringEntry[] }> {
    return this.http.put<{ tools: MonitoringEntry[] }>(`${this.base}/settings/monitoring/${tool}`, body, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Asks the tool its health with what the form says; it saves nothing. */
  testMonitoring(tool: MonitoringTool, body: MonitoringRequest): Observable<MonitoringTestResult> {
    return this.http.post<MonitoringTestResult>(`${this.base}/settings/monitoring/${tool}/test`, body, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  getDatabase(): Observable<DatabaseSettings> {
    return this.http.get<DatabaseSettings>(`${this.base}/settings/database`);
  }

  /** Saves where the history is kept; it takes effect when the server restarts. The caller explains a failure. */
  putDatabase(body: DatabaseRequest): Observable<DatabaseSettings> {
    return this.http.put<DatabaseSettings>(`${this.base}/settings/database`, body, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Opens a connection with what the form says and changes nothing. */
  testDatabase(body: DatabaseRequest): Observable<DatabaseTestResult> {
    return this.http.post<DatabaseTestResult>(`${this.base}/settings/database/test`, body, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Copies the SQLite history into the saved database. */
  copyDatabase(): Observable<{ copied: Record<string, number> }> {
    return this.http.post<{ copied: Record<string, number> }>(`${this.base}/settings/database/copy`, {}, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  // --- the data of the server ----------------------------------------------------
  /** The engine, the migrations, the rows per table, the import records and the state files left behind. The card explains a failure. */
  getDataStatus(): Observable<DataStatus> {
    return this.http.get<DataStatus>(`${this.base}/data/status`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Imports the state kept in files: every entity not imported yet, or the one named (again, whatever its state). The card explains `404` and `409`. */
  importData(entity?: string): Observable<DataImportAnswer> {
    return this.http.post<DataImportAnswer>(`${this.base}/data/import`, entity === undefined ? {} : { entity }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Deletes the state files of the entities named, all or nothing. The card explains `404` and `409`. */
  cleanLegacyData(entities: string[]): Observable<DataCleanAnswer> {
    return this.http.post<DataCleanAnswer>(`${this.base}/data/legacy/clean`, { entities }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /**
   * The export: a .zip of the tables and a manifest. It is fetched with the token like any other call, because the server
   * accepts a ticket only on the routes that list it and this is not one. The card explains a failure.
   */
  downloadDataExport(): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.base}/data/export`, { observe: 'response', responseType: 'blob', context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** The methods to recognise a song and which of them can be used now (nothing is started to find out). */
  recognizers(): Observable<{ recognizers: Recognizer[] }> {
    return this.http.get<{ recognizers: Recognizer[] }>(`${this.base}/music/recognizers`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** What LAION-CLAP hears in an audio or video of the project's sources (its service has to be running). */
  recognizeSource(projectId: string, source: string, method: RecognizeMethod): Observable<RecognizeResult> {
    return this.http.post<RecognizeResult>(`${this.base}/projects/${projectId}/recognize`, { source, method }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Estimates the tempo and key of an audio or video of the project's sources. */
  measureSource(projectId: string, source: string): Observable<MeasureResult> {
    return this.http.post<MeasureResult>(`${this.base}/projects/${projectId}/measure`, { source }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** The lyrics-from-transcript task: orders a transcription into sections and proposes a style and tags without inventing text. */
  assistSong(body: Omit<SongAssistRequest, 'task'>): Observable<SongAssistResponse> {
    return this.http.post<SongAssistResponse>(
      `${this.base}/assist`,
      { task: 'lyrics-from-transcript', ...body },
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  // --- import ---------------------------------------------------------------
  previewImport(
    content: string,
    project?: string,
    silenceSeconds?: number,
    mode: ImportMode = 'video',
  ): Observable<ImportPreview> {
    return this.http.post<ImportPreview>(`${this.base}/import/preview`, {
      content,
      project,
      silence_seconds: silenceSeconds,
      ...(mode !== 'video' ? { mode } : {}),
    });
  }

  confirmImport(id: string, yaml: string): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/import/confirm`, { id, yaml });
  }

  /** Asks Ollama to drop every loaded model; returns their names. */
  unloadOllama(): Observable<{ unloaded: string[] }> {
    return this.http.post<{ unloaded: string[] }>(`${this.base}/environment/ollama/unload`, {});
  }

  // --- runs -----------------------------------------------------------------
  /** With `quiet`, a refusal (missing engine or model) is explained by the caller, not by the snackbar. */
  launchRun(projectId: string, req: RunRequest, quiet = false): Observable<LaunchResponse> {
    return this.http
      .post<LaunchResponse>(`${this.base}/projects/${projectId}/runs`, req, {
        context: quiet ? new HttpContext().set(SKIP_ERROR_TOAST, true) : undefined,
      })
      .pipe(tap(() => this.launches.update((n) => n + 1)));
  }

  /** Counts the runs launched from this page, so the activity watch looks at the server right away. */
  readonly launches = signal(0);

  /** With `quiet`, a failure is not announced (the activity watch asks every few seconds). */
  listRuns(project?: string, limit?: number, quiet = false): Observable<Run[]> {
    const params: Record<string, string> = {};
    if (project) params['project'] = project;
    if (limit) params['limit'] = String(limit);
    return this.http.get<Run[]>(`${this.base}/runs`, {
      params,
      context: quiet ? new HttpContext().set(SKIP_ERROR_TOAST, true) : undefined,
    });
  }

  /** With `quiet`, a failure (e.g. a run deleted from the history) is explained by the caller, not by the snackbar. */
  getRun(id: string, quiet = false): Observable<{ run: Run; queue_position?: number }> {
    return this.http.get<{ run: Run; queue_position?: number }>(`${this.base}/runs/${id}`, {
      context: quiet ? new HttpContext().set(SKIP_ERROR_TOAST, true) : undefined,
    });
  }

  getStats(q: StatsQuery = {}): Observable<StatsResult> {
    const params: Record<string, string> = {};
    if (q.project) params['project'] = q.project;
    if (q.mode) params['mode'] = q.mode;
    if (q.origin) params['origin'] = q.origin;
    if (q.server) params['server'] = q.server;
    if (q.client) params['client'] = q.client;
    if (q.since) params['since'] = q.since;
    if (q.until) params['until'] = q.until;
    return this.http.get<StatsResult>(`${this.base}/stats`, { params });
  }

  /** The resources sampled during a run; the caller explains a failure, not the snackbar. */
  getRunResources(id: string): Observable<RunResources> {
    return this.http.get<RunResources>(`${this.base}/runs/${id}/resources`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /** Deletes one finished run from the history; its files are kept unless `deleteFiles`. */
  deleteRun(id: string, deleteFiles = false): Observable<void> {
    const params = deleteFiles ? '?delete_files=true' : '';
    return this.http.delete<void>(`${this.base}/runs/${id}${params}`);
  }

  /** Deletes finished runs by ids or by filter; active runs are skipped and reported. */
  deleteRuns(req: RunsDeleteRequest): Observable<RunsDeleteResult> {
    return this.http.post<RunsDeleteResult>(`${this.base}/runs/delete`, req);
  }

  cancelRun(id: string): Observable<{ run: Run }> {
    return this.http.post<{ run: Run }>(`${this.base}/runs/${id}/cancel`, {});
  }

  // --- storage ----------------------------------------------------------------
  getStorage(): Observable<StorageOverview> {
    return this.http.get<StorageOverview>(`${this.base}/storage`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  getProjectStorage(projectId: string): Observable<ProjectStorage> {
    return this.http.get<ProjectStorage>(`${this.base}/projects/${projectId}/storage`);
  }

  cleanProjectStorage(projectId: string, parts: string[]): Observable<StorageCleanResult> {
    return this.http.post<StorageCleanResult>(`${this.base}/projects/${projectId}/storage/clean`, { parts });
  }

  // --- project review ---------------------------------------------------------
  /** The Ollama models that can read images, smallest first. */
  getVisionModels(): Observable<{ models: string[] }> {
    return this.http.get<{ models: string[] }>(`${this.base}/review/vision-models`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Starts the analysis of the project's animated clips (202), or creates an empty review with `analyze: false` (201). */
  startReview(projectId: string, body: { model?: string; analyze?: boolean } = {}): Observable<Review> {
    return this.http.post<Review>(`${this.base}/projects/${projectId}/reviews`, body);
  }

  listReviews(projectId: string): Observable<ReviewSummary[]> {
    return this.http.get<ReviewSummary[]>(`${this.base}/projects/${projectId}/reviews`);
  }

  getReview(id: string): Observable<ReviewDetail> {
    return this.http.get<ReviewDetail>(`${this.base}/reviews/${id}`);
  }

  deleteReview(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/reviews/${id}`);
  }

  deleteReviews(req: ReviewsDeleteRequest): Observable<{ deleted: number; skipped_active: string[] }> {
    return this.http.post<{ deleted: number; skipped_active: string[] }>(`${this.base}/reviews/delete`, req);
  }

  createFinding(reviewId: string, body: FindingRequest): Observable<Finding> {
    return this.http.post<Finding>(`${this.base}/reviews/${reviewId}/findings`, body);
  }

  patchFinding(reviewId: string, findingId: string, body: FindingRequest): Observable<Finding> {
    return this.http.patch<Finding>(`${this.base}/reviews/${reviewId}/findings/${findingId}`, body);
  }

  /** The motion prompt the local assistant proposes for a finding's scene (it changes nothing). */
  suggestMotion(reviewId: string, findingId: string): Observable<{ motion_prompt: string }> {
    return this.http.post<{ motion_prompt: string }>(`${this.base}/reviews/${reviewId}/findings/${findingId}/suggest`, {}, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Applies the fixes of findings (all the pending ones when `findingIds` is empty) as tasks through the run queue. */
  runReviewTasks(reviewId: string, findingIds: string[], gpu = ''): Observable<ReviewTasksResult> {
    return this.http.post<ReviewTasksResult>(`${this.base}/reviews/${reviewId}/tasks`, { finding_ids: findingIds, gpu });
  }

  /** URL of the frame that is the evidence of a finding, for an <img>. */
  findingFrameUrl(reviewId: string, findingId: string): string {
    return this.tickets.withTicket(`${this.base}/reviews/${reviewId}/findings/${findingId}/frame`);
  }

  // --- artifacts --------------------------------------------------------------
  /** URL of a project artifact, for <audio>/<video>/<img> elements. */
  artifactUrl(projectId: string, relPath: string): string {
    return this.tickets.withTicket(this.artifactPath(projectId, relPath));
  }

  /** A JSON file of a project's artifacts (a record a run left); a missing one is a 404 the caller handles, with no toast. */
  getArtifactJson<T>(projectId: string, relPath: string): Observable<T> {
    return this.http.get<T>(this.artifactPath(projectId, relPath), { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  private artifactPath(projectId: string, relPath: string): string {
    return `${this.base}/projects/${projectId}/artifacts/${relPath}`;
  }

  /** manifest.json of an images project (404 until a run exported it; the callers show an empty state, not a toast). */
  getManifest(projectId: string, projectName: string): Observable<ImagesManifest> {
    return this.http.get<ImagesManifest>(
      this.artifactPath(projectId, `out/${projectName}/manifest.json`),
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  /** manifest.json of a music project (404 until a run exported it). */
  getMusicManifest(projectId: string, projectName: string): Observable<MusicManifest> {
    return this.http.get<MusicManifest>(
      this.artifactPath(projectId, `out/${projectName}/manifest.json`),
      { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
    );
  }

  // --- song library -------------------------------------------------------------
  /** One page of the library's songs, with the total of the server (`X-Total-Count`, or the page itself when it is absent). The store explains a failure. */
  listLibrarySongs(query: LibrarySongsQuery): Observable<LibrarySongsPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '' && value !== false) params = params.set(key, String(value));
    return this.http.get<LibrarySong[]>(`${this.base}/library/songs`, { params, observe: 'response', context: new HttpContext().set(SKIP_ERROR_TOAST, true) }).pipe(
      map((res) => {
        const items = res.body ?? [];
        const total = Number(res.headers.get('X-Total-Count'));
        return { items, total: Number.isFinite(total) && res.headers.has('X-Total-Count') ? total : items.length };
      }),
    );
  }

  /** Sets the stars of one song (`0` removes them) and answers the song as it is now. */
  rateSong(key: string, stars: number): Observable<LibrarySong> {
    return this.http.put<LibrarySong>(`${this.base}/library/songs/${encodeURIComponent(key)}/rating`, { stars }, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Reads the projects again for audio put or removed by hand. It may take a while. */
  rescanLibrary(): Observable<RescanResult> {
    return this.http.post<RescanResult>(`${this.base}/library/rescan`, {}, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  listPlaylists(): Observable<LibraryPlaylistSummary[]> {
    return this.http.get<LibraryPlaylistSummary[]>(`${this.base}/library/playlists`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** A playlist with its songs' keys in order. */
  getPlaylist(id: string): Observable<LibraryPlaylist> {
    return this.http.get<LibraryPlaylist>(`${this.base}/library/playlists/${encodeURIComponent(id)}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Makes a playlist; the server makes the id from the name when none is sent. */
  createPlaylist(body: { name: string; songs?: string[]; id?: string }): Observable<LibraryPlaylist> {
    return this.http.post<LibraryPlaylist>(`${this.base}/library/playlists`, body, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  /** Replaces the name and the songs of one playlist, and no other. */
  savePlaylist(id: string, body: { name: string; songs: string[] }): Observable<LibraryPlaylist> {
    return this.http.put<LibraryPlaylist>(`${this.base}/library/playlists/${encodeURIComponent(id)}`, body, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  deletePlaylist(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/library/playlists/${encodeURIComponent(id)}`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  // --- environment -------------------------------------------------------------
  getEnvironment(loraDir?: string): Observable<EnvironmentReport> {
    const params: Record<string, string> = {};
    if (loraDir) params['lora_dir'] = loraDir;
    return this.http.get<EnvironmentReport>(`${this.base}/environment`, { params });
  }

  // --- assets and downloads ----------------------------------------------------
  listAssets(): Observable<{ kinds: AssetKindListing[] }> {
    return this.http.get<{ kinds: AssetKindListing[] }>(`${this.base}/assets`);
  }

  /** The estimated time of a project from this machine's history where there is enough, and from the table where not. */
  estimate(body: { yaml: string; project?: string; gpu?: string }): Observable<ProjectEstimate> {
    return this.http.post<ProjectEstimate>(`${this.base}/estimate`, body);
  }

  /** The parts, typefaces and modes the music-motion catalog offers; an older server answers 404. */
  getMotionCatalog(): Observable<MotionCatalogJson> {
    return this.http.get<MotionCatalogJson>(`${this.base}/music-motion/catalog`, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
  }

  getCatalog(): Observable<{ entries: CatalogEntry[] }> {
    return this.http.get<{ entries: CatalogEntry[] }>(`${this.base}/assets/catalog`);
  }

  /**
   * The files of a Civitai model or version URL. Its failures (refused
   * reference, unknown model, Civitai unreachable) are explained next to the
   * field by the caller, so the generic error snackbar is skipped.
   */
  resolveCivitai(ref: string): Observable<CivitaiResolve> {
    return this.http.get<CivitaiResolve>(`${this.base}/civitai/resolve`, {
      params: { ref },
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  /**
   * Saves a download key (it is never read back). Failures are explained next
   * to the field by the caller, so the generic error snackbar is skipped.
   */
  saveToken(service: TokenService, token: string): Observable<void> {
    return this.http.put<void>(`${this.base}/tokens/${service}`, { token }, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  removeToken(service: TokenService): Observable<void> {
    return this.http.delete<void>(`${this.base}/tokens/${service}`, {
      context: new HttpContext().set(SKIP_ERROR_TOAST, true),
    });
  }

  deleteAsset(kind: AssetKind, name: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/assets/${kind}/${encodeURIComponent(name)}`);
  }

  createDownload(req: DownloadRequest): Observable<{ download: DownloadRecord }> {
    return this.http.post<{ download: DownloadRecord }>(`${this.base}/downloads`, req);
  }

  listDownloads(): Observable<{ downloads: DownloadRecord[] }> {
    return this.http.get<{ downloads: DownloadRecord[] }>(`${this.base}/downloads`);
  }

  cancelDownload(id: string): Observable<{ download: DownloadRecord }> {
    return this.http.post<{ download: DownloadRecord }>(`${this.base}/downloads/${id}/cancel`, {});
  }
}
