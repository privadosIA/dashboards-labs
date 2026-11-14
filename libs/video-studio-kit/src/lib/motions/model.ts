/** What the library of motions is, in plain TypeScript: nothing here knows about Angular or HTTP. */
import type { InputFile } from '../video-edit/model';

export type MotionState = 'processing' | 'ready' | 'failed';

/** A short video of people moving that Motion Control can apply to a picture. */
export interface Motion {
  id: string;
  title: string;
  tags: readonly string[];
  /** Seconds, at most MOTION_MAX_SECONDS. */
  duration: number;
  /** How many people the server found in it. */
  people: number;
  /** Only a `ready` motion can be used; a `processing` one is being prepared and a `failed` one says why. */
  state: MotionState;
  /** The address of a small video of it, ready to play. */
  preview: string;
  error?: string;
}

export const MOTION_MAX_SECONDS = 30;

/** Exactly one of `video` and `source` (an address the server can read) is given. */
export interface MotionRequest {
  video?: InputFile;
  source?: string;
  title?: string;
  tags?: readonly string[];
}

export const isMotionSettled = (m: Pick<Motion, 'state'>): boolean => m.state !== 'processing';
