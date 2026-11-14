/** What editing a video is, in plain TypeScript: nothing here knows about Angular or HTTP. */

export const TOOL_IDS = ['scale', 'interpolate', 'reframe', 'remove-background', 'depth', 'extend', 'motion-control'] as const;
export type ToolId = (typeof TOOL_IDS)[number];

/** A setting a tool accepts, as the server describes it. */
export interface SettingSpec {
  name: string;
  kind: 'choice' | 'number' | 'integer' | 'boolean' | 'string' | 'color';
  /** The values accepted when `kind` is `choice`. */
  values?: readonly (string | number)[];
  min?: number;
  max?: number;
  default?: string | number | boolean;
  description?: string;
  /** The server wants it and it cannot be blank (the prompt of extend). */
  required?: boolean;
}

/** An edit tool. The port lists them in a stable order, unavailable ones marked. */
export interface EditToolInfo {
  id: ToolId;
  name: string;
  description: string;
  /** Whether it can run now; one that cannot is listed but never accepted. */
  available: boolean;
  /** Why it is not available, when it is not. */
  reason?: string;
  /** Whether it needs a reference image. */
  needsImage: boolean;
  /** Whether it can take a motion of the library instead of a video. */
  acceptsMotion: boolean;
  /** Limits worth showing to the person. */
  notes: readonly string[];
  settings: readonly SettingSpec[];
}

/** A file the person chose: its name (the server reads the extension) and its bytes. */
export interface InputFile {
  name: string;
  blob: Blob;
}

export interface VideoEditRequest {
  tool: ToolId;
  /** The tool's settings, by the names of its `SettingSpec`s; what is not given takes the tool's default. */
  settings: Record<string, string | number | boolean>;
  /** The video to edit; absent when `motion` is given. */
  video?: InputFile;
  /** The reference image, only for a tool that needs one. */
  image?: InputFile;
  /** The identifier of a ready motion of the library, instead of `video` (Motion Control only). */
  motion?: string;
}

export type VideoEditState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface VideoEditResult {
  /** The address of the video, ready to play or download. */
  video: string;
  format: 'mp4' | 'webm';
  hasAudio: boolean;
  width?: number;
  height?: number;
  fps?: number;
  /** Seconds. */
  duration?: number;
  engine?: string;
  notes: readonly string[];
  /** Only `extend`: how many times the video has been made longer since its original. */
  extendedTimes?: number;
}

export interface VideoEdit {
  id: string;
  tool: ToolId;
  settings: Readonly<Record<string, string | number | boolean>>;
  /** The motion used instead of a video, when one was. */
  motion?: string;
  state: VideoEditState;
  /** 0 to 100. */
  progress: number;
  /** An ISO date. */
  createdAt: string;
  result?: VideoEditResult;
  /** Why it failed, when it did; a failed edit has no result. */
  error?: string;
}

export const isEditFinished = (e: Pick<VideoEdit, 'state'>): boolean => e.state === 'done' || e.state === 'failed' || e.state === 'cancelled';
