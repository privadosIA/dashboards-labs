import { ProjectConfig } from '../../../core/api.models';

/**
 * What the project gives a scene that sets nothing, as the placeholders of the
 * scene's own quality fields (an empty box means the project's value).
 */
export function projectPlaceholders(cfg: ProjectConfig | null | undefined): Record<string, string> {
  const d = cfg?.defaults;
  const a = d?.animate;
  const animateDiff = a?.engine === 'animatediff';
  const twoExpert = !!a?.high_noise_diffusion_model;
  const text = (v: string | number | undefined | null) => (v === undefined || v === null || v === '' ? undefined : String(v));
  const out: Record<string, string | undefined> = {
    transition_seconds: cfg ? text(d?.transition_seconds ?? 0) : undefined,
    'render.resolution': text(d?.resolution),
    'render.steps': text(d?.steps),
    'render.cfg_scale': text(d?.model_set?.cfg_scale),
    'animation.resolution': text(a?.resolution ?? (animateDiff ? '512x512' : '832x480')),
    'animation.frames': text(a?.frames ?? (animateDiff ? 16 : 33)),
    'animation.steps': text(a?.steps ?? (animateDiff ? 25 : twoExpert ? 10 : 20)),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as Record<string, string>;
}
