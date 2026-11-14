/** What a generation is, in plain TypeScript: nothing here knows about Angular or HTTP. */

export const DURATION_MIN = 4;
export const DURATION_MAX = 30;
/** The shapes the server makes (its `aspect_ratios`): the studio offers no other. */
export const ASPECT_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16'] as const;
export const QUALITIES = ['480p', '720p', '1080p'] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type Quality = (typeof QUALITIES)[number];

export interface StartImage {
  name: string;
  dataUrl: string;
}

/** A video or audio (or an image) chosen as a reference: the file itself and, when the browser could read it, its length. */
export interface ReferenceFile {
  name: string;
  blob: Blob;
  /** Seconds, for a video or an audio whose length could be read. */
  seconds?: number;
}

export interface References {
  images: readonly ReferenceFile[];
  videos: readonly ReferenceFile[];
  audios: readonly ReferenceFile[];
}

export const NO_REFERENCES: References = { images: [], videos: [], audios: [] };

/** What one model takes of one kind of reference: how many and, for a video or an audio, how long each. */
export interface InputLimit {
  min?: number;
  max: number;
  maxSeconds?: number;
}

/** What a model accepts besides the prompt. A model that says nothing takes a start image only (`START_ONLY`). */
export interface ModelInputs {
  startImage: boolean;
  endImage: boolean;
  referenceImages?: InputLimit;
  referenceVideos?: InputLimit;
  referenceAudios?: InputLimit;
}

export const START_ONLY: ModelInputs = { startImage: true, endImage: false };

/** Whether a model takes references at all (a model without limits for any kind does not). */
export const takesReferences = (i: ModelInputs): boolean => !!(i.referenceImages?.max || i.referenceVideos?.max || i.referenceAudios?.max);

export type InputKind = 'start_image' | 'end_image' | 'reference_image' | 'reference_video' | 'reference_audio';

/** A file a generation used, as the server keeps it: the address is read-only. */
export interface GenerationInput {
  kind: InputKind;
  name: string;
  url: string;
}

/** A model a generation can use. The port lists them; the first is the default. */
export interface VideoModel {
  id: string;
  name: string;
  description: string;
  /** Whether this machine can make videos with it now; one that cannot is listed but never accepted. */
  available: boolean;
  /** Why it is not available, when it is not. */
  reason?: string;
  /** Whether it writes the sound of the video; `false` means it makes none, and unknown (absent) is treated as "it may". */
  audio?: boolean;
  /** What it accepts besides the prompt; absent means a start image only. */
  inputs?: ModelInputs;
}

export interface GenerationSettings {
  prompt: string;
  startImage: StartImage | null;
  /** The identifier of one of the port's models; empty means "the port's default". */
  model: string;
  /** Whole seconds, DURATION_MIN to DURATION_MAX. */
  duration: number;
  aspectRatio: AspectRatio;
  quality: Quality;
  audio: boolean;
  /** What should be heard, optional: it goes inside the prompt as a sentence (`fullPrompt`); empty when absent. */
  sound?: string;
  /** The end image: only with a model that takes one, and it needs the start image. */
  endImage?: StartImage | null;
  /** The references: only with a model that takes them, and never together with a start or end image. */
  references?: References;
  /** Files the server already keeps (the inputs of another generation): they are asked to be reused, not sent again. Any change to the inputs drops it. */
  reuse?: { of: string; inputs: readonly GenerationInput[] };
}

export const DEFAULT_SETTINGS: GenerationSettings = {
  prompt: '',
  startImage: null,
  model: '',
  duration: 5,
  aspectRatio: '16:9',
  quality: '720p',
  audio: true,
  sound: '',
};

export type GenerationState = 'queued' | 'running' | 'done' | 'failed';

export interface Generation {
  id: string;
  settings: GenerationSettings;
  state: GenerationState;
  /** 0 to 100: 0 while queued, 100 when done. */
  progress: number;
  /** An ISO date: when it was asked for. Absent in a history saved before this was kept. */
  createdAt?: string;
  /** Set when `done`. */
  videoUrl?: string;
  /** Set when `failed`. */
  error?: string;
  /** The files it used, the start image first. Absent in a history saved before the inputs were kept. */
  inputs?: readonly GenerationInput[];
}

export interface Estimate {
  /** How long the generation is expected to take. */
  seconds: number;
  /** How big the video is expected to be. */
  megabytes: number;
}

export const isFinished = (g: Pick<Generation, 'state'>): boolean => g.state === 'done' || g.state === 'failed';
