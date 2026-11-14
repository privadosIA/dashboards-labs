// Typed mirror of the management API (docs/http-api.md). Pipeline event
// fields follow docs/events.md: absent means absent — check presence,
// never falsiness.

export interface ProjectSummary {
  id: string;
  name: string;
  mode: 'video' | 'images' | 'music' | '';
  scene_count: number;
  /** Songs of a music project. */
  track_count?: number;
  /** The project's label: true (for adults), false (reviewed, fine for everyone), absent (not reviewed). */
  adult?: boolean;
  invalid?: boolean;
  error?: string;
}

export interface Motion {
  type: string;
  intensity?: number;
}

export interface Look {
  grain: number;
  white_balance: string;
}

/** Diffusion model + text encoder + VAE, used instead of `defaults.model` (Krea 2, IntoRealism). */
export interface ModelSet {
  diffusion_model: string;
  /** The text encoder of an ordinary set; an editing set has none (it has `clip_l` and `t5xxl`). */
  llm?: string;
  vae: string;
  cfg_scale?: number;
  /** An editing model (FLUX.1 Kontext): a scene's `init_image` is the picture to edit and the prompt the instruction. */
  edit?: boolean;
  clip_l?: string;
  t5xxl?: string;
  /** The other family of editing models (Qwen-Image-Edit): `llm` with its vision projector instead of `clip_l` and `t5xxl`. */
  llm_vision?: string;
}

export type AnimateEngine = 'wan' | 'animatediff' | 'minimax-h3' | 'ltx-2.3';

/** Image-to-video models and optional settings (`defaults.animate`): Wan, or AnimateDiff when `engine` says so. */
export interface AnimateSettings {
  /** Absent means Wan. `minimax-h3` (video + audio) is chosen in the engine selector or in the YAML; the quality levels leave its files and settings alone. */
  engine?: AnimateEngine;
  /** MiniMax-H3: the Qwen3-VL text encoder and the audio VAE (`diffusion_model` and `vae` are its DiT and video VAE). */
  llm?: string;
  audio_vae?: string;
  /** LTX-2.3: the embeddings-connectors file (its other files are `diffusion_model`, `vae`, `audio_vae` and `llm`, the Gemma encoder). */
  connectors?: string;
  lora?: string;
  /** MiniMax-H3: the scene's picture is the clip's first frame (the FL2VA model) instead of a reference image. */
  first_frame?: boolean;
  /** MiniMax-H3 and LTX-2.3: the audio the model writes is mixed in as ambience under the narration (off when absent). */
  model_audio?: boolean;
  /** LTX-2.3: that audio carries a voice (a line asked of the model), so it is mixed at full level instead of as ambience. */
  model_audio_speech?: boolean;
  /** Wan files; neither required nor used with AnimateDiff. */
  diffusion_model?: string;
  t5xxl?: string;
  vae?: string;
  /** AnimateDiff: an SD 1.5 checkpoint, the motion module and how far frames may move from the still (0 < strength <= 1). */
  checkpoint?: string;
  motion_module?: string;
  strength?: number;
  resolution?: string;
  frames?: number;
  fps?: number;
  steps?: number;
  cfg_scale?: number;
  /** Turns on the two-expert mode (Wan A14B): `diffusion_model` is then the low-noise expert. */
  high_noise_diffusion_model?: string;
  high_noise_steps?: number;
  high_noise_cfg_scale?: number;
}

export interface Scene {
  id: string;
  prompt: string;
  negative_prompt: string;
  seed?: number;
  tts_text: string;
  speed: number;
  /** The Piper voice that narrates this scene (`voices/<name>.onnx`); absent = the project's voice. */
  voice?: string;
  /** The speaker of a multi-speaker voice; absent = the project's speaker for the project's voice, else the first. */
  speaker?: number;
  variants?: number;
  lora: string;
  silence_seconds?: number;
  motion?: Motion;
  look?: Look;
  /** Opt in to the animate phase (Wan); needs defaults.animate. */
  animate?: boolean;
  /** Video prompt; falls back to the scene prompt when empty. */
  motion_prompt?: string;
  /** The scene's own picture: a file in the project's sources folder, instead of generating one. '' = chosen but not picked yet. */
  image?: string;
  /** The scene's own video: a file in the sources folder, instead of generating and animating a picture. '' = chosen but not picked yet. */
  clip?: string;
  /** The part of the clip the scene uses, in seconds from the start of the file; absent = the whole clip. */
  clip_start?: number;
  clip_end?: number;
  /** How fast the scene's video plays (1 = its own speed, 0.5 half, 2 double); absent = automatic. */
  clip_speed?: number;
  /** The crossfade into this scene from the previous one; absent = the project's, 0 = a hard cut. */
  transition_seconds?: number;
  /** The kind of that transition (ffmpeg xfade name); absent = the project's. */
  transition?: string;
  /** A picture the generation starts from (img2img): a file in the sources folder. '' = enabled but not picked yet. */
  init_image?: string;
  /** How far the result may depart from init_image, 0 to 1 (default 0.6). */
  strength?: number;
  /** This scene's own render settings; absent = the project's. */
  render?: SceneRender;
  /** This scene's own Wan settings (only used when it animates); absent = the project's. */
  animation?: SceneAnimation;
  /** The vision model that wrote the prompt from a reference picture or clip; only a record. */
  described_by?: string;
  /** The scene is an animated HTML page (written by the model, drawn with Chrome) described by this text. '' = chosen but not written yet. */
  motion_graphic?: string;
  /**
   * The scene is drawn by a part of the music-motion catalog: its name, or `auto` so the model chooses one from `motion_graphic`.
   * '' = chosen but not picked yet. It excludes the scene's own picture, clip, starting picture and animation.
   */
  motion_part?: string;
  /** The parameters of that part, typed as the catalog says. */
  motion_params?: Record<string, unknown>;
  /** One line shown under the scene (up to 120 characters). */
  motion_text?: string;
  /** The tempo the part follows, 40 to 240. */
  motion_bpm?: number;
  /** An animated title or lower third drawn over the scene's video. */
  overlay?: SceneOverlay;
}

/** Where in the frame an overlay goes. */
export type OverlayPosition = 'top' | 'center' | 'bottom';

/** A transparent animated page drawn over a scene. */
export interface SceneOverlay {
  /** The text to show, or a description of what to show. */
  text: string;
  /** Seconds within the scene; absent = from the start / to the end of the scene. */
  start?: number;
  end?: number;
  /** Absent = bottom. */
  position?: OverlayPosition;
}

/** The stored page of a motion-graphic scene or overlay (`GET /api/projects/{id}/scenes/{scene}/motion`). */
export interface MotionPage {
  scene: string;
  overlay: boolean;
  exists: boolean;
  html: string;
  /** The page ready for a sandboxed frame; moved with postMessage({type: 'seek', t}). */
  preview?: string;
  duration: number;
  /** generated: as the model wrote it; edited: changed since; supplied: written by hand. */
  origin?: 'generated' | 'edited' | 'supplied';
  summary?: string;
  model?: string;
  browser?: string;
}

/** Each field is optional: absent means the project's value. */
/** Generation settings found in an imported picture or clip; every field is optional. */
export interface GenerationMetadata {
  prompt?: string;
  negative_prompt?: string;
  seed?: number;
  steps?: number;
  cfg_scale?: number;
  sampler?: string;
  model?: string;
  width?: number;
  height?: number;
  strength?: number;
}

/** What uploading a starting picture answers: its name and the settings it carried, if any. */
export interface PictureUploadResult {
  name: string;
  metadata?: GenerationMetadata;
}

export interface SceneRender {
  resolution?: string;
  steps?: number;
  cfg_scale?: number;
}

export interface SceneAnimation {
  resolution?: string;
  frames?: number;
  steps?: number;
}

/** One song request of a music project (`tracks:` in scenes.yaml). Absent optionals are not sent to the engine. */
export interface Track {
  id: string;
  /** The style description (caption); required. */
  prompt: string;
  lyrics?: string;
  instrumental?: boolean;
  duration_seconds?: number;
  bpm?: number;
  keyscale?: string;
  timesignature?: string;
  vocal_language?: string;
  /** Voice asked for in the caption (female, male, duet, child, choir, deep); absent: the model chooses. */
  vocals?: string;
  /** HeartMuLa generator only: the style as comma-separated tags (piano,happy,wedding). */
  tags?: string;
  seed?: number;
  variants?: number;
  /** Absent: the language model runs only when the track has no lyrics of its own. */
  use_lm?: boolean;
  /** The title written in the tags of the mp3 (the id, spaced, when absent). */
  title?: string;
  /** `off` for no cover, or a picture of the project's sources to use as it is; absent: as the project. */
  cover?: string;
  /** An installed adapter (LoRA) and its strength; unset inherits the project's. */
  adapter?: string;
  adapter_scale?: number;
  /** Transforms an existing song (`source`) instead of creating a new one. */
  task?: MusicTask;
  /** A file in the project's sources folder (not a path). */
  source?: string;
  /** A new song's timbre reference: a file in the sources folder. */
  reference?: string;
  cover_strength?: number;
  repaint_start?: number;
  repaint_end?: number;
  /** extract: the instrument or voice to isolate. */
  stem?: string;
}

/** The soundtrack of a video project: generated from `prompt`, or the source file `file`. */
export interface BackgroundMusic {
  prompt?: string;
  file?: string;
  volume?: number;
  fade_seconds?: number;
  ducking?: boolean;
  seed?: number;
}

/** What a track does with its source song; absent means a new song. */
export type MusicTask = 'cover' | 'cover-nofsq' | 'repaint' | 'extract';

/** An audio file in a project's sources folder (GET /api/projects/{id}/sources). */
export interface SourceInfo {
  name: string;
  /** audio (mp3, wav), image, video (a clip a scene can use) or blend (a Blender scene); older servers do not say. */
  kind?: 'audio' | 'image' | 'video' | 'blend';
  /** Only for videos: the scenes that use it as their clip (empty: nobody, so it can be deleted). */
  used_by?: string[];
  size: number;
  modified: string;
}

/** The clip a project kept for one of its scenes (GET /api/clips). */
export interface KeptClip {
  project: string;
  scene: string;
  /** clip: the finished clip of the scene; animation: its complete animation (forward and back). Older servers do not say. */
  kind?: 'clip' | 'animation';
  size: number;
  modified: string;
  /** How a motion-graphic scene's page was made (the model that wrote it, the browser); absent for any other scene. */
  motion?: string;
}

/** Engine models and generation parameters shared by every track (`defaults.music`). */
export interface MusicSettings {
  models_dir?: string;
  lm_model?: string;
  synth_model?: string;
  output_format?: 'mp3' | 'wav';
  /** How the engine runs: a program per phase (default) or one ace-server for the run. */
  engine?: 'cli' | 'server';
  /** Which model makes the songs: ace-step (default) or heartmula (optional, runs in a container or on another machine). */
  generator?: 'ace-step' | 'heartmula' | 'diffrhythm2';
  /** With the server: keep the models in GPU memory between jobs (default true). */
  keep_loaded?: boolean;
  mp3_bitrate?: number;
  lm_temperature?: number;
  lm_cfg_scale?: number;
  lm_top_p?: number;
  lm_top_k?: number;
  lm_negative_prompt?: string;
  inference_steps?: number;
  guidance_scale?: number;
  shift?: number;
  solver?: string;
  vocal_language?: string;
  /** Default voice of the tracks that set none. */
  vocals?: string;
  /** Text put in front of every track's prompt to form its caption. */
  style_prefix?: string;
  /** Adapter (LoRA) and strength every track uses unless it sets its own. */
  adapter?: string;
  adapter_scale?: number;
  /** Written in the tags of every mp3 (the project's name when absent). */
  artist?: string;
  /** `auto`: a cover per song made with the project's image model; absent or `off`: none. */
  cover?: 'auto' | 'off';
  /** Evens every exported song to this integrated loudness (LUFS); absent leaves each song as made. */
  loudness_lufs?: number;
}

/** The design of the motion scenes of a project (the server's `MusicDesign`); each field is optional here. */
export interface MotionDesign {
  dark?: string;
  light?: string;
  accent?: string;
  display?: string;
  body?: string;
  default_mode?: 'dark' | 'light';
  modes?: Record<string, 'dark' | 'light'>;
  concept?: string;
  verse_style?: string;
  hit_style?: string;
}

/** What the motion scenes of a project share (`defaults.motion`). */
export interface MotionDefaults {
  /** The tempo when a scene names none (120 if absent). */
  bpm?: number;
  design?: MotionDesign;
  /** An audio file of the project's sources: the scenes follow its beats and it is their soundtrack. */
  song?: string;
}

export interface ProjectConfig {
  project: string;
  /** true: for adults (18+); false: reviewed and fine for everyone; absent: not reviewed. */
  adult?: boolean;
  output_file?: string;
  output: { mode: string; file: string; contact_sheet: boolean };
  defaults: {
    model: string;
    voice: string;
    /** The speaker of `voice` when that model holds several (0, the first, if absent). */
    voice_speaker?: number;
    resolution: string;
    sampler: string;
    steps: number;
    fps: number;
    subject_prompt: string;
    negative_prompt: string;
    lora_model_dir: string;
    model_set?: ModelSet;
    animate?: AnimateSettings;
    music?: MusicSettings;
    /** Crossfade between scenes in seconds (0 or absent = hard cuts); a scene's own value overrides it. */
    transition_seconds?: number;
    /** Kind of transition between scenes (absent = "fade", the crossfade); a scene's own overrides it. */
    transition?: string;
    /** The tempo, design and song of the scenes drawn by a part of the catalog. */
    motion?: MotionDefaults;
  };
  scenes: Scene[];
  /** Background music of a video project. */
  bgm?: BackgroundMusic;
  /** Music projects only (`output.mode: music`); scenes are then empty. */
  tracks?: Track[];
  /** Timelines of clips rendered into one song each (music projects). */
  mixes?: Mix[];
  /** Songs marked as keepers (music projects): the track and the seed it was made with. */
  favorites?: Favorite[];
}

/** A song marked as a keeper; the seed identifies it across changes in how many variants a track makes. */
export interface Favorite {
  track: string;
  seed: number;
}

export interface ConfigResponse {
  yaml: string;
  parsed?: ProjectConfig;
  valid: boolean;
  warnings?: string[];
  error?: string;
}

export type CachePhaseState = 'hit' | 'run' | 'always' | 'n/a';

export interface CacheReport {
  mode: string;
  cold: boolean;
  scenes: { scene_id: string; phases: Record<string, CachePhaseState> }[];
}

export type RunState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

/** The states a run can be deleted in. */
export const FINISHED_RUN_STATES: readonly RunState[] = ['succeeded', 'failed', 'cancelled', 'interrupted'];

/** Either `ids` or a filter, never both (the server refuses the mix). */
export interface RunsDeleteRequest {
  ids?: string[];
  project?: string;
  states?: RunState[];
  /** RFC 3339; compared with the run's creation time. */
  before?: string;
  /** Also remove the output folder (out/<name>) of each deleted run. */
  delete_files?: boolean;
}

export interface RunsDeleteResult {
  deleted: number;
  /** Output folders removed when `delete_files` was requested. */
  files_removed?: number;
  /** Runs that were queued or running and so were not deleted. */
  skipped_active: string[];
}

export interface Run {
  id: string;
  project: string;
  state: RunState;
  /** The server that made the run, when several share the history. */
  server?: string;
  gpu: string;
  keep_tmp: boolean;
  force: boolean;
  only?: string;
  vram_warn_mb: number;
  mode?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  artifact?: string;
  error?: string;
  /** False when the run's project or files are gone: nothing to link (the run stays in the history and the statistics). */
  result_available?: boolean;
}

export interface RunRequest {
  gpu?: string;
  keep_tmp?: boolean;
  force?: boolean;
  only?: string;
  vram_warn_mb?: number;
  mode?: string;
}

export interface LaunchResponse {
  run: Run;
  queue_position: number;
  /** Warnings that do not stop the run (little free disk space). */
  warnings?: string[];
}

/** One verbatim pipeline event (docs/events.md). */
export interface PipelineEvent {
  timestamp: string;
  type:
    | 'pipeline_start'
    | 'phase_start'
    | 'phase_end'
    | 'skipped'
    | 'warn'
    | 'error'
    | 'pipeline_end';
  scene_id?: string;
  phase?: string;
  duration_ms?: number;
  artifact?: string;
  message?: string;
}

/** Server-originated `run-state` SSE notification. */
export interface RunStatePayload {
  id: string;
  state: RunState;
  queue_position?: number;
  artifact?: string;
  error?: string;
}

export interface ImportEntryReport {
  id: string;
  mapped: string[];
  discarded: string[];
  rejected?: string;
}

export interface ImportPreview {
  yaml: string;
  report: string;
  entries: ImportEntryReport[];
  imported: number;
  silent: number;
  /** Instrumental tracks of a music import. */
  instrumental?: number;
  rejected: number;
}

/** What an import produces: scenes for a video project, tracks for a music one. */
export type ImportMode = 'video' | 'motion' | 'music';

export interface ImportResult {
  id: string;
  mode: ImportMode;
}

export interface BinaryStatus {
  name: string;
  required: boolean;
  present: boolean;
  path?: string;
  version?: string;
  fix?: string;
  /** Where it renders when it has several (Blender: the Cycles devices); not shown yet. */
  devices?: string[];
}

export interface AssetEntry {
  name: string;
  size: number;
  /** The speakers of a Piper voice that holds several (absent for the usual single one). */
  speakers?: VoiceSpeaker[];
}

export interface VoiceSpeaker {
  id: number;
  name: string;
}

export interface GpuStatus {
  index: number;
  name: string;
  free_vram_mb: number;
  /** The card's memory, whatever the desktop holds right now. */
  total_vram_mb?: number;
  /** How many times slower than the reference machine (an RTX 5060 Ti) the card has been in the renders and animations of its runs; absent until there are enough. */
  speed_factor?: number;
  speed_samples?: number;
  /** Memory an Ollama process holds on this GPU. */
  ollama_mb?: number;
  /** Little free VRAM (under 6 GB). */
  low_vram?: boolean;
  warnings?: string[];
}

/** Free and total space of the disk that holds the projects. */
export interface DiskReport {
  free_bytes?: number;
  total_bytes?: number;
  /** Below this the space is low (20 GB, or ORCHESTRATOR_MIN_FREE_GB). */
  warn_below_bytes?: number;
  /** A warning only: it never prevents a run. */
  low?: boolean;
}

/** The machine's memory (used = total - available). */
export interface RamReport {
  total_bytes: number;
  available_bytes: number;
}

/** The Ollama address in use, where it comes from and whether it is not this machine. */
export interface OllamaSettings {
  host: string;
  source: 'setting' | 'env' | 'default';
  remote: boolean;
  /** The address saved in the settings; '' when none. */
  saved: string;
}

/** The Chrome or Chromium that draws motion graphics. */
export interface BrowserSettings {
  /** The path saved in the settings; '' = search the PATH. */
  saved: string;
  found: boolean;
  path?: string;
  version?: string;
  /** Why none can be used, with how to fix it. */
  error?: string;
}

/** The model that writes the pages of motion graphics and overlays. */
export interface MotionModelSettings {
  /** The model saved in the settings; '' = none. */
  saved: string;
  /** The one used when none is saved (the assistant's). */
  default: string;
}

/** The optional HeartMuLa music service: where an external one is, never its token. */
export interface HeartMulaSettings {
  saved: string;
  token_set: boolean;
  remote: boolean;
  consented: boolean;
}

export interface HeartMulaTestResult {
  ok: boolean;
  host: string;
  remote: boolean;
  version?: string;
  gpu?: string;
  free_mb?: number;
  reason?: string;
  error?: string;
}

/** Why the HeartMuLa generator cannot be used; only the first four are things to install here. */
export type EngineReason = 'no_service' | 'no_weights' | 'no_gpu' | 'unreachable' | 'no_consent' | 'key_rejected' | 'not_running';

/** The lifecycle of the service of a local music generator. */
export interface ContainerState {
  state: 'stopped' | 'starting' | 'running';
  gpu?: number;
  port?: number;
  since?: string;
  /** RAM the container uses; only with `?stats=1`. */
  memory_mb?: number;
  /** Why the last start failed. */
  error?: string;
}

export interface EngineAvailability {
  available: boolean;
  container?: ContainerState;
  mode?: 'local' | 'external';
  reason?: EngineReason;
  detail?: string;
  missing?: string[];
  version?: string;
}

export interface EnginesResponse {
  engines: Record<string, EngineAvailability>;
}

/** The same for the optional DiffRhythm2 music service. */
export type DiffRhythm2Settings = HeartMulaSettings;

export interface SettingsResponse {
  ollama: OllamaSettings;
  heartmula?: HeartMulaSettings;
  diffrhythm2?: DiffRhythm2Settings;
  remote?: { max_calls: number };
  browser?: BrowserSettings;
  motion_model?: MotionModelSettings;
}

export interface OllamaTestResult {
  ok: boolean;
  host: string;
  remote: boolean;
  version?: string;
  models?: { name: string; vision: boolean }[];
  error?: string;
}

/** The tasks that can be routed to a provider. */
export type RoutingTask = 'assistant' | 'describe_image' | 'describe_video' | 'quality' | 'motion_graphics';

export const ROUTING_TASKS: readonly RoutingTask[] = ['assistant', 'describe_image', 'describe_video', 'quality', 'motion_graphics'];

/** The provider a task runs on. */
export interface RoutedTask {
  provider: string;
  name: string;
  /** The provider is not this machine: what the task sends leaves this computer. */
  remote: boolean;
  /** Sending data to it was acknowledged (always true for a local one). */
  consented: boolean;
  /** The model used for the task; '' when the provider declares none (an Ollama then picks one). */
  model: string;
}

export interface RoutingResponse {
  routing: Record<RoutingTask, RoutedTask>;
  /** The most calls one job may make to a remote provider. */
  max_calls: number;
}

/** What to retry a refused description with: a model at a provider. */
export interface DescribeAlternative {
  provider: string;
  name: string;
  model: string;
}

/** Why a task cannot run now (`GET /api/models/availability`). */
export type UnavailableReason = 'unreachable' | 'no_models' | 'no_vision_model' | 'no_model' | 'no_consent' | 'key_rejected';

export interface TaskAvailability {
  available: boolean;
  provider: { id: string; name: string; type: 'ollama' | 'openai' };
  reason?: UnavailableReason;
}

export interface AvailabilityResponse {
  tasks: Record<RoutingTask, TaskAvailability>;
}

/** A model provider as the API describes it: never its key, only whether one is saved. */
export interface ProviderInfo {
  id: string;
  name: string;
  type: 'ollama' | 'openai';
  base_url: string;
  text_model: string;
  vision_model: string;
  /** The Ollama of the Ollama setting: always there, not editable here. */
  builtin: boolean;
  remote: boolean;
  key_set: boolean;
  /** The public edition does not use this provider's address: no task runs on it. */
  blocked?: boolean;
}

/** What POST and PUT /api/providers take. `key`: absent leaves it, '' removes it. */
export interface ProviderInput {
  id?: string;
  name: string;
  type: 'ollama' | 'openai';
  base_url: string;
  text_model?: string;
  vision_model?: string;
  key?: string;
}

export interface ProviderTestResult {
  ok: boolean;
  host: string;
  remote: boolean;
  models?: { name: string; vision?: boolean }[];
  error?: string;
}

export interface EnvironmentReport {
  /** Which projects this server shows: censored hides the ones for adults; strict also the ones not reviewed. */
  content_mode?: 'censored' | 'strict' | 'all';
  /** Fixed when the program is built: the public edition lacks some controls. */
  edition?: 'private' | 'public';
  /** The Ollama address in use (no request is made to it). */
  ollama?: Pick<OllamaSettings, 'host' | 'source' | 'remote'>;
  /** Only when the server has a models directory. */
  models_dir?: ModelsDirectory;
  binaries: BinaryStatus[];
  models: AssetEntry[];
  /** The installed files that only retouch models use; they are not among the image `models`. */
  retouch?: AssetEntry[];
  voices: AssetEntry[];
  loras: AssetEntry[];
  /** The GGUF files of models/music (language model, text encoder, synthesis model, VAE). */
  music?: AssetEntry[];
  /** The installed music adapters (LoRAs): one entry per file or folder, with the total size of its files. */
  music_adapters?: AssetEntry[];
  gpus: GpuStatus[];
  gpu_error?: string;
  /** Whether the server has a download key per service (never the value). */
  tokens?: TokenStatus;
  /** Where the key in use comes from; a service is absent when it has no key. */
  token_sources?: TokenSources;
  disk?: DiskReport;
  ram?: RamReport;
  /** The Whisper models of models/whisper (the lyrics reader). */
  transcription?: AssetEntry[];
  /** Whether a spoken request can be transcribed here (Whisper, its model and ffmpeg). */
  dictation?: { available: boolean; reason?: string };
}

/** `env`: an environment variable (it wins over the file); `file`: saved from the dashboard or by hand. */
export type TokenSource = 'env' | 'file';
export type TokenSources = Partial<Record<'huggingface' | 'civitai', TokenSource>>;

export interface TokenStatus {
  huggingface: boolean;
  civitai: boolean;
}

/** Services whose account key a download can need. */
export type TokenService = keyof TokenStatus;

export interface ImagesManifest {
  project: string;
  mode: string;
  generated_at: string;
  images: ManifestImage[];
}

export interface ManifestImage {
  scene_id: string;
  variant: number;
  effective_seed: number;
  prompt: string;
  negative_prompt: string;
  model: string;
  resolution: [number, number];
  sampler: string;
  steps: number;
  file: string;
}

/** manifest.json of a music project: one entry per exported song variant. */
/**
 * One clip of a mix (`mixes[].clips[]` in scenes.yaml). Its audio is a track
 * of the project (`track`, `variant` 1-based) or a source (`file`); absent
 * numbers mean the default (start 0, gain 1, no fades, the whole file).
 */
export interface MixClip {
  track?: string;
  variant?: number;
  file?: string;
  start?: number;
  gain?: number;
  mute?: boolean;
  fade_in?: number;
  fade_out?: number;
  trim_start?: number;
  trim_end?: number;
}

/** A timeline of clips rendered into one song (`mixes:` in scenes.yaml). */
export interface Mix {
  id: string;
  clips: MixClip[];
  /** Master volume of the whole mix, 0 to 2; absent is 1. */
  gain?: number;
  /** Brings the mix to a standard loudness (-14 LUFS) after the volume. */
  normalize?: boolean;
}

/** `GET /api/projects/{id}/peaks`: a drawing of a file and where it has sound. */
export interface PeaksResponse {
  duration: number;
  buckets: number;
  peaks: number[];
  active: { start: number; end: number } | null;
  /** Where the pulse falls in the file (second of its first beat, under one beat); only when asked with a tempo and the audio has a clear pulse. */
  beat_offset?: number | null;
}

export interface MixManifestEntry {
  id: string;
  file: string;
  audio_seconds: number;
  hash: string;
  clips: MixClip[];
  /** The files the mix read and their hashes; absent in manifests written before this was recorded. */
  inputs?: { file: string; sha256: string }[];
  /** The master settings it was rendered with (absent: 1 and off). */
  gain?: number;
  normalize?: boolean;
  /** Integrated loudness of the rendered file in LUFS, when it could be measured. */
  lufs?: number;
}

export interface MusicManifest {
  project: string;
  mode: string;
  generated_at: string;
  tracks: MusicManifestEntry[];
  /** Present when the project has mixes. */
  mixes?: MixManifestEntry[];
}

export interface MusicManifestEntry {
  track_id: string;
  variant: number;
  effective_seed: number;
  lm_seed?: number;
  use_lm: boolean;
  /** The caption the synthesis received (enriched by the language model when it ran). */
  caption: string;
  lyrics_requested?: string;
  /** What was actually sung. */
  lyrics_sung?: string;
  instrumental?: boolean;
  bpm?: number;
  /** Target length in the request vs the length of the file. */
  duration_seconds?: number;
  audio_seconds?: number;
  keyscale?: string;
  timesignature?: string;
  vocal_language?: string;
  lm_model?: string;
  synth_model: string;
  /** Set when the song transforms another one. */
  task?: MusicTask;
  source?: string;
  reference?: string;
  params: Record<string, unknown>;
  file: string;
  /** Content hash of the song, so a mix can tell it was regenerated. */
  sha256?: string;
  /** The title written in its tags, and the cover picture exported next to it (absent: none). */
  title?: string;
  cover?: string;
  /** What the automatic checks measured in the song; absent when they could not run. */
  check?: MusicCheck;
}

/** The measurements of a song and the problems found (empty `issues`: all good). */
export interface MusicCheck {
  peak_db?: number;
  lufs?: number;
  issues?: MusicIssue[];
}

/** One problem found in a song; `detail` is a short English text with the measured value. */
export interface MusicIssue {
  code: 'clipping' | 'silence' | 'quiet' | 'loud' | 'duration';
  detail: string;
}

/** POST /api/assist (docs/http-api.md): a prompt for the image generator or for the animation. */
export interface AssistRequest {
  task: 'image' | 'motion' | 'tags' | 'improve';
  text: string;
  /** An installed Ollama model; absent = the server's default. */
  model?: string;
}

/** One chat model installed in Ollama (`GET /api/assist/models`). */
export interface AssistModel {
  name: string;
  size_bytes: number;
  /** Whether it passes the assistant's memory rule with the memory free now. */
  fits: boolean;
}

export interface AssistModelsResponse {
  /** The model a request that names none uses. */
  default: string;
  models: AssistModel[];
}

/** What `POST /api/describe` returns: the prompt of a reference picture or clip. */
export interface DescribeResult {
  prompt: string;
  /** Clips only: a movement prompt of about 25 words; may be missing. */
  motion?: string;
  /** The vision model that described it. */
  model: string;
  /** The id of the provider that described it ('ollama' is the built-in one). */
  provider?: string;
  kind: 'image' | 'video';
  frames: number;
  /** Only when a clip was split: one entry per shot, in order; `prompt` is the first shot's. */
  shots?: DescribeShot[];
}

/** One shot of a split clip. */
export interface DescribeShot {
  start: number;
  end: number;
  prompt: string;
  motion?: string;
}

export interface DescribeModelsResponse {
  /** The vision model a request that names none uses ('' when none is installed). */
  default: string;
  /** The more detailed one, '' when it is not installed. */
  detail: string;
  models: AssistModel[];
}

export interface AssistResponse {
  text: string;
}

/** The music task: a style (English) and lyrics (the description's language); lyrics are empty for an instrumental song. */
export interface MusicAssistRequest {
  task: 'music';
  text: string;
  instrumental?: boolean;
  /** The track's generator: HeartMuLa and DiffRhythm2 also get tags and the section tags they read. */
  generator?: MusicGeneratorName;
  model?: string;
}

/** What POST /api/assist/listen heard of a song that was playing: its kind, never its lyrics. */
export interface ListenResult {
  seconds: number;
  /** The tags LAION-CLAP gave to the sound (only with the method "clap"). */
  heard?: string[];
  language?: string;
  /** Fewer than four words were recognised: it may be instrumental or its voice could not be read. */
  no_words: boolean;
  /** What it sounds like, in plain words, measured on the recording. */
  sound?: string[];
  /** The assistant could not put a genre to it: the style only describes the sound. */
  genre_unknown?: boolean;
  bpm?: number;
  bpm_confidence?: number;
  keyscale?: string;
  key_confidence?: number;
  /** Genre, mood, instruments and voice, in English. */
  style?: string;
  /** What the lyrics are about, in their language; empty without words. */
  theme?: string;
  /** The sentence that asks for a new original song of that kind; empty when the style could not be told. */
  request?: string;
  warnings: string[];
}

/** The engines the run history can be kept in. */
export type DatabaseDriver = 'sqlite' | 'mysql' | 'postgres';

/** A database as the settings report it: never the password. */
export interface DatabaseView {
  driver: DatabaseDriver;
  host?: string;
  port?: number;
  name?: string;
  user?: string;
  password_set: boolean;
}

/** GET /api/settings/database. `saved` is what is saved, `active` what the server started with. */
export interface DatabaseSettings {
  saved: DatabaseView;
  active: DatabaseView;
  restart_required: boolean;
  server_name: string;
  servers: string[];
}

/** What the form sends. A `password` left out keeps the saved one. */
export interface DatabaseRequest {
  driver: DatabaseDriver;
  host?: string;
  port?: number;
  name?: string;
  user?: string;
  password?: string;
  server_name?: string;
}

export interface DatabaseTestResult {
  ok: boolean;
  version?: string;
  /** The database has no tables of the history yet. */
  empty?: boolean;
  error?: string;
}

/** The tools the user runs beside the server whose address is kept in Settings. */
export type MonitoringTool = 'grafana' | 'prometheus' | 'loki' | 'redis';

export interface MonitoringEntry {
  id: MonitoringTool;
  address?: string;
  user?: string;
  secret_set: boolean;
}

export interface MonitoringRequest {
  address: string;
  user?: string;
  /** Left out, the saved key is kept (when the address and the user are the same). */
  secret?: string;
}

export interface MonitoringTestResult {
  ok: boolean;
  version?: string;
  /** A user and key were given and the tool accepted (or refused) them. */
  authenticated?: boolean;
  error?: string;
}

/** The ways a song is recognised. Whisper reads the lyrics; the other two add what the sound is like. */
export type RecognizeMethod = 'whisper' | 'clap' | 'muq';

/** One method of GET /api/music/recognizers. `reason` and `detail` say why it cannot be used now. */
export interface Recognizer {
  id: RecognizeMethod;
  available: boolean;
  reason?: string;
  detail?: string;
}

export interface SoundTag {
  tag: string;
  score: number;
}

/** What LAION-CLAP heard in a source (POST /api/projects/{id}/recognize). */
export interface RecognizeResult {
  method: RecognizeMethod;
  genre: SoundTag[];
  mood: SoundTag[];
  instrument: SoundTag[];
  /** All the tags in the order they are written: genre, mood, instrument. */
  tags: string[];
}

/** A popular combination of style tags (GET /api/assist/music-tags). */
export interface MusicTagCombo {
  id: string;
  name: string;
  tags: string[];
}

/** The vocabulary of HeartMuLa's style tags (GET /api/assist/music-tags). */
export interface MusicTagCategory {
  id: string;
  tags: string[];
}

export type MusicGeneratorName = 'ace-step' | 'heartmula' | 'diffrhythm2';

/** The lyrics of a source read by Whisper (`POST /api/projects/{id}/transcribe`). */
export interface TranscribeResult {
  language: string;
  /** The language was detected (not given). */
  language_detected: boolean;
  /** The segments joined by line breaks; empty when the source has no words. */
  text: string;
  segments: { start: number; end: number; text: string }[];
  /** Segments dropped as empty, note-only or repeated more than three times in a row. */
  dropped: number;
  model: string;
}

/** The tempo and key of a source, estimated by the server (`POST /api/projects/{id}/measure`). */
export interface MeasureResult {
  duration: number;
  /** null when there is no clear pulse. */
  bpm: number | null;
  /** The half and the double of the tempo that fall between 60 and 200. */
  bpm_alternatives: number[];
  bpm_confidence: number;
  /** `D minor`; null when there is no clear key. */
  keyscale: string | null;
  key_confidence: number;
}

/** The lyrics-from-transcript task of the assistant. */
export interface SongAssistRequest {
  task: 'lyrics-from-transcript';
  text: string;
  generator?: MusicGeneratorName;
  language?: string;
  hint?: string;
  bpm?: number;
  keyscale?: string;
  picture?: string;
  model?: string;
}

export interface SongAssistResponse extends MusicAssistResponse {
  /** The lyrics have the words of the transcription and nothing else. */
  unchanged_words: boolean;
}

/** What a spoken request said (POST /api/transcribe). */
export interface DictationResult {
  text: string;
  language: string;
  language_detected: boolean;
  /** Seconds of the recording. */
  duration: number;
  model: string;
}

/** Where an estimated time comes from: this machine's history, the catalog's table, or both (POST /api/estimate). */
export type EstimateSource = 'history' | 'table' | 'mixed';

export interface ProjectEstimate {
  seconds: number;
  source: EstimateSource;
  /** The fewest executions behind any figure that comes from the history (absent without history). */
  executions?: number;
  history_phases: number;
  table_phases: number;
  cached_phases: number;
  gpu?: string;
}

export type RequestKind = 'video' | 'image' | 'music';

export interface RequestPlanBody {
  text: string;
  language?: string;
  /** Fixes the kind; the model is then not asked to decide it. */
  kind?: RequestKind;
  generator?: string;
  /** Fixes whether a song has a voice; absent, the model reads it from the text. */
  instrumental?: boolean;
  /** The length of a song, which sets the structure of its lyrics. */
  seconds?: number;
  attachments?: { image?: boolean; video?: boolean; audio?: boolean };
}

/** A free-form request turned into what the generators need (POST /api/assist/request). */
export interface RequestPlan {
  kind: RequestKind;
  kind_source: 'user' | 'model' | 'attachment' | 'default';
  title: string;
  language?: string;
  image_prompt?: string;
  motion_prompt?: string;
  /** The words a video has to say, found in the request; empty when it names none. */
  speech?: string;
  caption?: string;
  lyrics?: string;
  tags?: string;
  instrumental: boolean;
  seconds?: number;
  warnings: string[];
}

export interface MusicAssistResponse {
  text: string;
  caption: string;
  lyrics: string;
  /** Style tags, normalised; only for HeartMuLa and DiffRhythm2, and absent when the model gave none. */
  tags?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** describe_refused: the provider that refused. */
    provider?: string;
    /** describe_refused: what to retry with, a model at a provider each. */
    alternatives?: DescribeAlternative[];
  };
}

// --- assets and downloads (docs/http-api.md, model-management) -----------

export type AssetKind = 'model' | 'voice' | 'lora' | 'video' | 'music' | 'adapter' | 'heartmula' | 'diffrhythm2' | 'transcription';

export interface AssetEntry {
  name: string;
  size: number;
}

export interface AssetKindListing {
  kind: AssetKind;
  dir: string;
  extensions: string[];
  /** Server-side caveat for the kind (LoRA is stored but not applied). */
  note?: string;
  assets: AssetEntry[];
}

export interface CatalogTiming {
  seconds: number;
  resolution: string;
  steps: number;
  /** Clips only. */
  frames?: number;
  /** The same with the entry's turbo LoRA (MiniMax H3). */
  turbo_seconds?: number;
  turbo_steps?: number;
  /** Timed on the reference machine (true) or an estimate (false). */
  measured: boolean;
}

export interface CatalogEntry {
  id: string;
  /** Made for adult content: a project that uses it is labelled adult; a server that hides adult projects does not list it. */
  adult?: boolean;
  kind: AssetKind;
  name: string;
  description: string;
  /** A sensible first install for newcomers. */
  starter?: boolean;
  size_bytes: number;
  /** Rough minimum GPU memory (estimate, or measured for video); absent for voices and LoRAs. */
  vram_mb?: number;
  /** Minimum system RAM (GB) the bundle needs to run; absent when it is not a constraint. */
  min_ram_gb?: number;
  /** A measured way to run on a card with less memory than `vram_mb`: at this resolution it peaks at `vram_mb` of its own. */
  low_vram?: { vram_mb: number; resolution: string };
  /** `role` names a file in a multi-file bundle (video: model, text_encoder, vae; music: lm, text_encoder, dit, vae). */
  files: { name: string; role?: string; url: string }[];
  installed: boolean;
  /** Service whose account key the files need (`civitai`, `huggingface`); absent when none. */
  requires_token?: string;
  /** Settings measured to work with the model; a missing field means no recommendation. */
  preset?: CatalogPreset;
  /** Advice about the prompt the model needs (display only; never inserted into a prompt). */
  prompt_hint?: string;
  /** English texts of an entry written in Spanish; the dashboard shows them in English. */
  name_en?: string;
  description_en?: string;
  prompt_hint_en?: string;
  /** Whether the license allows commercial use: `yes`, `conditions` (read the note), `no` or `unknown`. */
  commercial?: 'yes' | 'conditions' | 'no' | 'unknown';
  license?: string;
  commercial_note?: string;
  commercial_note_en?: string;
  /** What an image model is good for (`photo`, `anime`, `general`). */
  styles?: string[];
  /** An editing model (FLUX.1 Kontext): it edits a given picture by instruction; it is not a generation model. */
  edit?: boolean;
  /** Order among the models of a style; lower is preferred. */
  style_rank?: number;
  /** How long one picture or clip takes on the reference machine (RTX 5060 Ti 16 GB), at these settings. */
  timing?: CatalogTiming;
  /** Where a Wan bundle sits on the quality scale (`low`, `medium`, `high`). */
  quality?: string;
}

export interface CatalogPreset {
  steps?: number;
  cfg_scale?: number;
  resolution?: string;
}

export type DownloadState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface DownloadRecord {
  id: string;
  state: DownloadState;
  kind: AssetKind;
  name: string;
  files: string[];
  /** `catalog:<id>`, `hf:<repo>/<file>` or the URL. */
  source: string;
  bytes: number;
  total?: number;
  error?: string;
  created_at: string;
  finished_at?: string;
}

export interface DownloadRequest {
  kind?: AssetKind;
  id?: string;
  url?: string;
  repo?: string;
  file?: string;
  revision?: string;
  name?: string;
  overwrite?: boolean;
}

export interface DownloadProgressPayload {
  id: string;
  bytes: number;
  /** 0 when the remote did not announce a size. */
  total: number;
}

export interface DownloadStatePayload {
  id: string;
  state: DownloadState;
  error?: string;
}

/** One file of a Civitai model version; absent facts are undefined, never guessed. */
export interface CivitaiFile {
  id: number;
  /** Suggested file name (Civitai's, minus a `_<fileId>` suffix). */
  name: string;
  type?: string;
  format?: string;
  fp?: string;
  size_bytes?: number;
  download_url: string;
}

export interface CivitaiResolve {
  model: { id?: number; name?: string; type?: string; base_model?: string };
  version: { id: number; name?: string };
  files: CivitaiFile[];
}

// --- statistics and run resources ---------------------------------------------

export interface StatsGroup {
  /** Project id, or GPU index (empty for runs without a pinned GPU). */
  name: string;
  runs: number;
  seconds: number;
  success_rate?: number;
  /** GPU rows only; absent when none of their runs has resource samples. */
  peak_vram_pct?: number;
  mean_peak_vram_pct?: number;
  sampled_runs?: number;
}

export interface StatsPhase {
  phase: string;
  executions: number;
  reused: number;
  total_seconds: number;
  mean_seconds?: number;
  p95_seconds?: number;
}

export interface StatsRunPoint {
  id: string;
  project: string;
  state: RunState;
  created_at: string;
  seconds: number;
  result_available?: boolean;
  /** The kind of the run's project (video, images or music); absent when the project is gone. */
  mode?: string;
}

export interface StatsResult {
  period: { since: string; until: string };
  project?: string;
  mode?: string;
  totals: {
    runs: number;
    by_state: Partial<Record<RunState, number>>;
    success_rate?: number;
    total_seconds: number;
    queue_wait_mean_seconds?: number;
  };
  duration: { runs: number; mean_seconds?: number; median_seconds?: number; p95_seconds?: number; total_seconds: number };
  by_day: { date: string; succeeded: number; failed: number; other: number; seconds: number }[];
  phases: StatsPhase[];
  cache: { executed: number; reused: number; reuse_share?: number };
  by_project: StatsGroup[];
  by_gpu: StatsGroup[];
  /** The runs by the kind of their project; the empty name is a project that no longer exists. */
  by_mode?: StatsGroup[];
  /** The runs by who asked for them: a generation panel's name, `unknown` or `embedded` (the normal projects). */
  by_client?: StatsGroup[];
  run_durations: StatsRunPoint[];
  slowest: StatsRunPoint[];
}

export interface StatsQuery {
  project?: string;
  /** Only the runs of projects of these kinds (comma separated: video, images, music). */
  mode?: string;
  /** Only the runs of projects made on the desktop or by the Create page (comma separated: desktop, mobile). */
  origin?: string;
  /** Only the runs made by these servers (comma separated names). */
  server?: string;
  /** Only the runs asked for by these clients (comma separated names). */
  client?: string;
  since?: string;
  until?: string;
}

export interface ResourcePoint {
  t_ms: number;
  used_mb: number;
  util_pct?: number;
}

/** What the sampler recorded while a run was active. VRAM is that of the whole GPU, not of the run. */
export interface RunResources {
  interval_ms: number;
  truncated: boolean;
  gpus: { index: number; total_mb: number; samples: ResourcePoint[] }[];
  ram: { total_mb: number; samples: ResourcePoint[] };
  peaks: { vram: { gpu: number; mb: number; pct: number }[]; ram: { mb: number; pct: number } | null };
}

// --- project review ------------------------------------------------------------

export type ReviewState = 'analyzing' | 'ready' | 'failed';
export type FindingStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type FixKind = 'trim' | 'reseed' | 'motion_prompt' | 'prompt';

/** How a finding is fixed: the kind and the parameter it needs. */
export interface Fix {
  kind: FixKind;
  /** trim: `seconds`; reseed: `seed`; motion_prompt: `motion_prompt`; prompt: `prompt`. */
  params?: Record<string, string | number>;
}

/** One analysis of a project's animated clips. */
export interface Review {
  id: string;
  project: string;
  state: ReviewState;
  /** The vision model used; empty when only colour and sharpness were measured. */
  model?: string;
  total: number;
  done: number;
  notes?: string;
  error?: string;
  created_at: string;
  finished_at?: string;
}

export interface ReviewSummary extends Review {
  findings: number;
  pending: number;
}

/** One thing noticed in a scene, with the fix proposed for it (also the task that applies it). */
export interface Finding {
  id: string;
  review_id: string;
  scene: string;
  /** deformation, color_drift, blur, or observation (the user's own). */
  kind: string;
  source: 'auto' | 'manual';
  from_seconds: number;
  severity: number;
  description: string;
  has_frame: boolean;
  fix: Fix;
  status: FindingStatus;
  run_id?: string;
  message?: string;
  created_at: string;
}

export interface ReviewDetail {
  review: Review;
  findings: Finding[];
}

export interface FindingRequest {
  scene?: string;
  from_seconds?: number;
  severity?: number;
  description?: string;
  fix?: Fix;
  skipped?: boolean;
}

export interface ReviewTasksResult {
  started: { finding_id: string; run_id: string }[];
  skipped: { finding_id: string; reason: string }[];
}

export interface ReviewsDeleteRequest {
  ids?: string[];
  project?: string;
  /** RFC 3339. */
  before?: string;
}

// --- storage ---------------------------------------------------------------------

export type StoragePartId = 'cache' | 'leftovers' | 'clips' | 'animations' | 'final' | 'sources' | 'reviews' | 'backups';

/** One part of a project's storage (GET /api/projects/{id}/storage). */
export interface StoragePart {
  id: StoragePartId;
  bytes: number;
  files: number;
  /** false for the results (final) and the inputs (sources). */
  cleanable: boolean;
}

export interface ProjectStorage {
  parts: StoragePart[];
  total_bytes: number;
}

/** The size of every project and the disk that holds them (GET /api/storage). */
export interface StorageOverview {
  projects: { id: string; total_bytes: number }[];
  disk: DiskReport;
  /** Only when the server keeps the projects in a media directory: its absolute path and the free space of its disk. */
  media?: MediaDirectory;
  /** Only when the server has a models directory: its path, whether it is usable and the free space of its disk. */
  models?: ModelsDirectory;
}

/** The models directory of the server (`models/` links to it); it may be on another disk that is not mounted. */
export interface ModelsDirectory {
  /** Absolute path, as the server sees it; the space is read on every request. */
  dir: string;
  /** False when its disk is not mounted: nothing can be installed (it is not the same as having no models). */
  available: boolean;
  /** `models/` leads to it; false with `available` true means `orchestrator models migrate` is missing. */
  linked: boolean;
  /** Why it is not available, or what is missing. */
  reason?: string;
  disk?: DiskReport;
}

/** The media directory of the server: where whole projects live, possibly on another disk. */
export interface MediaDirectory {
  /** Absolute path, as the server sees it; read on every request, so `disk` is what is left now. */
  dir: string;
  disk: DiskReport;
  projects: { id: string; folder: string }[];
}

export interface StorageCleanResult {
  freed_bytes: number;
  cleaned: Record<string, number>;
}

// --- project package (full export / import) -----------------------------------------------

/** One file a project needs, as the recipe lists it (and whether this machine has it). */
export interface RecipeFile {
  key: string;
  label: string;
  path: string;
  name: string;
  size_bytes?: number;
  catalog_id?: string;
  catalog_name?: string;
  url?: string;
  requires_token?: string;
  installed: boolean;
}

/** The catalog's recommended settings of a model, compared with what the project uses. */
export interface RecipePreset {
  for: string;
  catalog_id: string;
  catalog_name: string;
  recommended: CatalogPreset;
  used: CatalogPreset;
  matches: boolean;
  differences?: string[];
}

export interface RecipeAnimate {
  engine: string;
  resolution: string;
  frames: number;
  fps: number;
  steps: number;
  cfg_scale?: number;
  turbo_lora?: boolean;
}

export interface Recipe {
  format: number;
  project: string;
  mode: string;
  exported_at: string;
  settings: {
    resolution?: string;
    sampler?: string;
    steps?: number;
    cfg_scale?: number;
    fps?: number;
    animate?: RecipeAnimate;
    music?: { inference_steps?: number; output_format?: string };
  };
  presets?: RecipePreset[];
  files: RecipeFile[];
}

/** A catalog entry with files missing on this machine: installing it by its id brings them. */
export interface PackageInstallGroup {
  catalog_id: string;
  name: string;
  size_bytes: number;
  missing: string[];
  total_files: number;
  requires_token?: string;
}

export interface PackageReport {
  project: string;
  suggested_id: string;
  id_taken: boolean;
  mode: string;
  scenes: number;
  tracks: number;
  sources: number;
  recipe: Recipe;
  install: PackageInstallGroup[] | null;
  unknown: string[] | null;
  /** What the project's own validation says once its sources are in place (a file the package does not carry...). */
  problems: string[] | null;
  ready: boolean;
}

export interface PackageConfirmResult {
  id: string;
  ready: boolean;
  install: PackageInstallGroup[] | null;
  unknown: string[] | null;
  problems?: string[] | null;
}

// --- videoclip -----------------------------------------------------------------------------

/** A shot of the music video of a song: what it covers, how the camera moves and the picture to make. */
export interface VideoclipShot {
  id: string;
  section: string;
  start: number;
  seconds: number;
  /** The length of the scene: the crossfade eats the end of every one but the last, so the video ends where the song does. */
  duration: number;
  lines?: string[];
  motion: string;
  intensity: number;
  prompt: string;
}

export interface VideoclipPlan {
  title: string;
  caption: string;
  audio_file: string;
  audio_seconds: number;
  transition_seconds: number;
  subject_prompt: string;
  used_ai: boolean;
  warnings?: string[];
  /** The lyrics sections, and how many of the cuts between them were moved to a change of the song's loudness. */
  sections?: number;
  aligned_cuts?: number;
  shots: VideoclipShot[];
}

export interface VideoclipPlanRequest {
  track_id: string;
  variant?: number;
  shot_seconds?: number;
  transition_seconds?: number;
  ai?: boolean;
  model?: string;
}

// --- song library ----------------------------------------------------------------

/** One exported song of a music project; `key` is `project/track/seed`, the same identity favorites use. */
export interface LibrarySong {
  key: string;
  project: string;
  track_id: string;
  variant: number;
  seed: number;
  title: string;
  caption?: string;
  lyrics?: string;
  instrumental?: boolean;
  bpm?: number;
  keyscale?: string;
  vocal_language?: string;
  audio_seconds?: number;
  /** The audio, relative to its project. */
  file: string;
  cover?: string;
  favorite?: boolean;
  /** What made the song: ACE-Step, HeartMuLa or DiffRhythm2. */
  generator?: 'ace-step' | 'heartmula' | 'diffrhythm2';
  generated_at?: string;
}

export interface LibraryPlaylist {
  id: string;
  name: string;
  /** Song keys, in play order. */
  songs: string[];
}

/** What the user adds to the songs: stars (1 to 5; unrated songs have no entry) and playlists. */
export interface LibraryMeta {
  ratings: Record<string, number>;
  playlists: LibraryPlaylist[];
}

export interface LibraryResponse extends LibraryMeta {
  songs: LibrarySong[];
}


/** One part of `GET /api/music-motion/catalog` as the server writes it. */
export interface MotionCatalogPartJson {
  name: string;
  description: string;
  levels: string[];
  cost_ms: number;
  manual?: boolean;
  params: { name: string; type: 'string' | 'int' | 'number' | 'bool' | 'enum'; default: string; description?: string; min?: number; max?: number; max_length?: number; options?: string[] }[];
}

/** `GET /api/music-motion/catalog`: only what the editor reads of it. */
export interface MotionCatalogJson {
  parts: MotionCatalogPartJson[];
  fonts?: string[];
  modes?: string[];
}
