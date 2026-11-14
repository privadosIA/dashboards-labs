import { countInputs, hasAnyImage } from './inputs';
import { ASPECT_RATIOS, DURATION_MAX, DURATION_MIN, NO_REFERENCES, QUALITIES, takesReferences, type GenerationSettings, type ModelInputs } from './model';
import { PROMPT_MAX, fullPrompt } from './prompt';

export type Problem =
  | 'prompt-required'
  | 'prompt-too-long'
  | 'duration-not-whole'
  | 'duration-range'
  | 'aspect-ratio'
  | 'quality'
  | 'model'
  | 'start-image-not-accepted'
  | 'end-image-not-accepted'
  | 'end-image-needs-start'
  | 'references-not-accepted'
  | 'references-mixed'
  | 'reference-image-required'
  | 'reference-images-max'
  | 'reference-videos-max'
  | 'reference-audios-max'
  | 'reference-video-seconds'
  | 'reference-audio-seconds'
  | 'reuse-with-files'
  | 'reuse-unavailable';

/**
 * The problems of a set of settings, empty when it is valid. A real adapter uses this too, so the rule is the same on
 * both sides. With `models` (the identifiers the caller accepts) a model outside them is refused; without them only an
 * empty one is. `canSound` says whether the model writes sound (it does when unknown): only then does the sound count in
 * the length of the prompt. `inputs` (what the chosen model accepts) turns on the rules of the end image and the references;
 * without it only the start image is judged, as before.
 */
export function validate(settings: GenerationSettings, models?: readonly string[], canSound = true, inputs?: ModelInputs): Problem[] {
  const problems: Problem[] = [];
  if (!settings.prompt.trim() && !hasAnyImage(settings)) problems.push('prompt-required');
  if (fullPrompt(settings, canSound).length > PROMPT_MAX) problems.push('prompt-too-long');
  if (!Number.isInteger(settings.duration)) problems.push('duration-not-whole');
  else if (settings.duration < DURATION_MIN || settings.duration > DURATION_MAX) problems.push('duration-range');
  if (!(ASPECT_RATIOS as readonly string[]).includes(settings.aspectRatio)) problems.push('aspect-ratio');
  if (!(QUALITIES as readonly string[]).includes(settings.quality)) problems.push('quality');
  if (!settings.model || (models && !models.includes(settings.model))) problems.push('model');
  if (inputs) problems.push(...inputProblems(settings, inputs));
  return problems;
}

/** The problems of the end image and the references of a set of settings against what a model accepts. */
export function inputProblems(settings: GenerationSettings, inputs: ModelInputs): Problem[] {
  const problems: Problem[] = [];
  const c = countInputs(settings);
  const refs = settings.references ?? NO_REFERENCES;
  const references = takesReferences(inputs);
  const hasFiles = !!settings.startImage || !!settings.endImage || refs.images.length + refs.videos.length + refs.audios.length > 0;
  if (settings.reuse && hasFiles) problems.push('reuse-with-files');
  if (c.start && !inputs.startImage) problems.push('start-image-not-accepted');
  if (c.end && !inputs.endImage) problems.push('end-image-not-accepted');
  if (c.end && !c.start) problems.push('end-image-needs-start');
  if (c.images + c.videos + c.audios && !references) problems.push('references-not-accepted');
  if (references && c.start + c.end) problems.push('references-mixed');
  if (references) {
    if (c.images < (inputs.referenceImages?.min ?? 1)) problems.push('reference-image-required');
    if (inputs.referenceImages && c.images > inputs.referenceImages.max) problems.push('reference-images-max');
    if (c.videos > (inputs.referenceVideos?.max ?? 0)) problems.push('reference-videos-max');
    if (c.audios > (inputs.referenceAudios?.max ?? 0)) problems.push('reference-audios-max');
    const long = (files: typeof refs.videos, max?: number): boolean => max !== undefined && files.some((f) => f.seconds !== undefined && f.seconds > max);
    if (long(refs.videos, inputs.referenceVideos?.maxSeconds)) problems.push('reference-video-seconds');
    if (long(refs.audios, inputs.referenceAudios?.maxSeconds)) problems.push('reference-audio-seconds');
  }
  return problems;
}

const MESSAGES: Record<Problem, string> = {
  'start-image-not-accepted': 'the start image is not accepted by this model',
  'end-image-not-accepted': 'the end image is not accepted by this model',
  'end-image-needs-start': 'the end image needs a start image',
  'references-not-accepted': 'references are not accepted by this model',
  'references-mixed': 'references cannot be mixed with a start or an end image',
  'reference-image-required': 'at least one reference image is needed',
  'reference-images-max': 'there are more reference images than this model accepts',
  'reference-videos-max': 'there are more reference videos than this model accepts',
  'reference-audios-max': 'there are more reference audios than this model accepts',
  'reference-video-seconds': 'a reference video is longer than this model accepts',
  'reference-audio-seconds': 'a reference audio is longer than this model accepts',
  'reuse-with-files': 'inputs to reuse cannot be sent together with files',
  'reuse-unavailable': 'the inputs of that generation are no longer kept',
  'prompt-required': 'a prompt or a start image is needed',
  'prompt-too-long': `the prompt and the sound together must be at most ${PROMPT_MAX} characters`,
  'duration-not-whole': 'the duration must be a whole number of seconds',
  'duration-range': `the duration must be from ${DURATION_MIN} to ${DURATION_MAX} seconds`,
  'aspect-ratio': `the aspect ratio must be one of ${ASPECT_RATIOS.join(', ')}`,
  quality: `the quality must be one of ${QUALITIES.join(', ')}`,
  model: 'the model must be one of the available ones',
};

/** The limit a problem is about, said after its message when the model's inputs are known. */
function limitOf(problem: Problem, inputs?: ModelInputs): string {
  const l = { 'reference-images-max': inputs?.referenceImages, 'reference-videos-max': inputs?.referenceVideos, 'reference-audios-max': inputs?.referenceAudios, 'reference-video-seconds': inputs?.referenceVideos, 'reference-audio-seconds': inputs?.referenceAudios }[problem as string];
  if (!l) return '';
  return problem.endsWith('seconds') ? ` (at most ${l.maxSeconds} s)` : ` (at most ${l.max})`;
}

/** Thrown (through the Observable) when a request is refused; nothing was created. */
export class GenerationRefused extends Error {
  constructor(readonly problems: readonly Problem[], inputs?: ModelInputs) {
    super(problems.map((p) => MESSAGES[p] + limitOf(p, inputs)).join('; '));
    this.name = 'GenerationRefused';
  }
}
