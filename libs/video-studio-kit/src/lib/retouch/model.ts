/** What retouching an image is, in plain TypeScript: nothing here knows about Angular or HTTP. */
import type { StartImage } from '../video/model';

/** How far the result may move away from the original: above 0 and up to this. */
export const STRENGTH_MAX = 1;
export const STRENGTH_DEFAULT = 0.6;
export const VARIANTS_MIN = 1;
/** The most variants when the model is not known; a model says its own in `maxVariants`. */
export const VARIANTS_MAX = 4;
export const VARIANTS_DEFAULT = 2;

/** A model a retouch can use. The port lists them, unavailable ones marked; the default is the first available. */
export interface ImageModel {
  id: string;
  name: string;
  description: string;
  /** Whether the model can be used now; one that cannot is listed but never accepted. */
  available: boolean;
  /** Why it is not available, when it is not. */
  reason?: string;
  /** Whether the model takes a strength; one that does not (it edits by instruction) is never sent one. */
  strength: boolean;
  /** Whether the model takes a negative prompt. */
  negativePrompt: boolean;
  /** The most variants it makes in one request, at least 1. */
  maxVariants: number;
}

export interface EditRequest {
  image: StartImage;
  /** The identifier of one of the port's models; empty means "the port's default". */
  model: string;
  /** What to change. */
  prompt: string;
  /** What to avoid; empty when there is nothing to avoid. */
  negativePrompt: string;
  /** Above 0 and at most STRENGTH_MAX: low keeps the picture, high lets the prompt rewrite it. */
  strength: number;
  /** A whole number from VARIANTS_MIN to the model's `maxVariants`. */
  variants: number;
}

export interface EditResult {
  /** The seed that makes this result again. */
  seed: number;
  image: StartImage;
}

export const DEFAULT_EDIT: Pick<EditRequest, 'model' | 'prompt' | 'negativePrompt' | 'strength' | 'variants'> = {
  model: '',
  prompt: '',
  negativePrompt: '',
  strength: STRENGTH_DEFAULT,
  variants: VARIANTS_DEFAULT,
};
