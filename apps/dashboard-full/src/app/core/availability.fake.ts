import { AvailabilityResponse, RoutingTask } from './api.models';

/** A answer of `GET /api/models/availability` in which every model task can run (for tests of the controls). */
export const ALL_AVAILABLE: AvailabilityResponse = {
  tasks: Object.fromEntries(
    (['assistant', 'describe_image', 'describe_video', 'quality', 'motion_graphics'] as RoutingTask[]).map((t) => [t, { available: true, provider: { id: 'ollama', name: 'Ollama', type: 'ollama' } }]),
  ) as AvailabilityResponse['tasks'],
};

/** An answer in which one task lacks its model (the provider answers but has none that fits). */
export function missing(task: RoutingTask, reason: 'no_models' | 'no_vision_model' | 'no_model' | 'unreachable', type: 'ollama' | 'openai' = 'ollama', name = type === 'ollama' ? 'Ollama' : 'Nube'): AvailabilityResponse {
  const base = structuredClone(ALL_AVAILABLE);
  base.tasks[task] = { available: false, reason, provider: { id: type === 'ollama' ? 'ollama' : 'cloud', name, type } };
  return base;
}
