import { STRENGTH_MAX, VARIANTS_MAX, VARIANTS_MIN, type EditRequest, type ImageModel } from './model';

export type EditProblem = 'prompt-required' | 'strength' | 'variants' | 'model';

/**
 * The problems of a request, empty when it is valid. A real adapter uses this too, so the rule is the same on both
 * sides. With `models` (the ones the caller lists) a model outside them, or not available, is refused, and the strength is judged only
 * if the chosen model takes one and the variants against what it makes; without them only an empty model is refused
 * and the strength and the variants (up to VARIANTS_MAX) are always judged.
 */
export function validateEdit(request: EditRequest, models?: readonly ImageModel[]): EditProblem[] {
  const model = models?.find((m) => m.id === request.model && m.available);
  const problems: EditProblem[] = [];
  if (!request.prompt.trim()) problems.push('prompt-required');
  if (model?.strength !== false && (!Number.isFinite(request.strength) || request.strength <= 0 || request.strength > STRENGTH_MAX)) problems.push('strength');
  if (!Number.isInteger(request.variants) || request.variants < VARIANTS_MIN || request.variants > (model?.maxVariants ?? VARIANTS_MAX)) problems.push('variants');
  if (!request.model || (models && !model)) problems.push('model');
  return problems;
}

const messages = (maxVariants: number): Record<EditProblem, string> => ({
  'prompt-required': 'a prompt is needed',
  strength: `the strength must be above 0 and at most ${STRENGTH_MAX}`,
  variants: `the variants must be a whole number from ${VARIANTS_MIN} to ${maxVariants}`,
  model: 'the model must be one of the available ones',
});

/** Thrown (through the Observable) when a request is refused; nothing was produced. */
export class EditRefused extends Error {
  /** `maxVariants` is the chosen model's, for the message about the variants. */
  constructor(readonly problems: readonly EditProblem[], maxVariants: number = VARIANTS_MAX) {
    super(problems.map((p) => messages(maxVariants)[p]).join('; '));
    this.name = 'EditRefused';
  }
}
