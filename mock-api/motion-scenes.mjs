// The scene fields that name a part of the music-motion catalog (`motion_part`, `motion_params`, `motion_text`, `motion_bpm`)
// and `defaults.motion`, judged as the server judges them when a project is saved: what is refused names the scene, the part
// and the parameter, in a 422 that saves nothing. The checks are a simplification of the server's (the limits are the
// catalog's and the contract's); the mock keeps the rest of a project as the text it was given.
import { PARTS, designProblem } from './music-motion.mjs';

export const MAX_MOTION_TEXT = 120;
export const MIN_MOTION_BPM = 40;
export const MAX_MOTION_BPM = 240;

const EXCLUDED = ['image', 'init_image', 'clip', 'animate', 'motion_prompt', 'animation', 'render'];

/** The first thing wrong with the parameters of a part, or ''. */
function paramProblem(scene, part, name, value) {
  const q = part.params.find((x) => x.name === name);
  if (!q) return `scene "${scene}": part ${part.name} has no parameter "${name}"`;
  const at = `scene "${scene}": parameter ${name} of ${part.name}`;
  switch (q.type) {
    case 'int':
    case 'number':
      if (typeof value !== 'number' || (q.type === 'int' && !Number.isInteger(value))) return `${at} must be ${q.type === 'int' ? 'a whole number' : 'a number'}`;
      return (q.min !== undefined && value < q.min) || (q.max !== undefined && value > q.max) ? `${at} is outside ${q.min} to ${q.max}` : '';
    case 'bool':
      return typeof value === 'boolean' ? '' : `${at} must be true or false`;
    case 'enum':
      return q.options.includes(value) ? '' : `${at} must be one of ${q.options.join(', ')}`;
    default:
      return typeof value !== 'string' ? `${at} must be a text` : q.max_length && value.length > q.max_length ? `${at} is longer than ${q.max_length} characters` : '';
  }
}

/** The reason a parsed project is refused for its motion fields, or ''. `parts` are the catalog's (the approved ones included). */
export function motionConfigProblem(project, parts = PARTS) {
  const defaults = project?.defaults?.motion;
  if (defaults !== undefined) {
    if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return 'defaults.motion must be a mapping';
    if (defaults.bpm !== undefined && !(typeof defaults.bpm === 'number' && defaults.bpm >= MIN_MOTION_BPM && defaults.bpm <= MAX_MOTION_BPM)) return `defaults.motion.bpm must be from ${MIN_MOTION_BPM} to ${MAX_MOTION_BPM}`;
    if (defaults.song !== undefined && (typeof defaults.song !== 'string' || !/\.(mp3|wav)$/i.test(defaults.song))) return 'defaults.motion.song must be an .mp3 or .wav of the sources';
    if (defaults.design !== undefined) {
      // Laid over a fixed design so that the colours, typefaces and modes the person left out are fine.
      const base = { dark: '#101018', light: '#f4f1ea', accent: '#ff5a3c', display: 'Inter', body: 'Inter', default_mode: 'dark', concept: '' };
      const why = designProblem({ ...base, ...defaults.design });
      if (why) return `defaults.motion.design: ${why}`;
    }
  }
  for (const scene of project?.scenes ?? []) {
    const id = scene?.id ?? '?';
    const has = scene?.motion_part !== undefined;
    if (!has) {
      if (['motion_params', 'motion_text', 'motion_bpm'].some((k) => scene?.[k] !== undefined)) return `scene "${id}": motion_params, motion_text and motion_bpm need motion_part`;
      continue;
    }
    if (typeof scene.motion_part !== 'string') return `scene "${id}": motion_part must be a text`;
    const clash = EXCLUDED.find((k) => scene[k] !== undefined && scene[k] !== false);
    if (clash) return `scene "${id}": motion_part cannot be combined with ${clash}`;
    if (scene.motion_part === 'auto') {
      if (typeof scene.motion_graphic !== 'string' || !scene.motion_graphic.trim()) return `scene "${id}": motion_part auto needs motion_graphic, the description the model chooses from`;
      if (scene.motion_params !== undefined) return `scene "${id}": motion_params do not go with motion_part auto`;
    } else {
      const part = parts.find((p) => p.name === scene.motion_part);
      if (!part) return `scene "${id}": motion_part "${scene.motion_part}" is not in the catalog`;
      if (scene.motion_graphic !== undefined) return `scene "${id}": motion_part ${part.name} needs no motion_graphic`;
      for (const [name, value] of Object.entries(scene.motion_params ?? {})) {
        const why = paramProblem(id, part, name, value);
        if (why) return why;
      }
    }
    if (scene.motion_text !== undefined && (typeof scene.motion_text !== 'string' || scene.motion_text.length > MAX_MOTION_TEXT)) return `scene "${id}": motion_text must be a text of up to ${MAX_MOTION_TEXT} characters`;
    if (scene.motion_bpm !== undefined && !(typeof scene.motion_bpm === 'number' && scene.motion_bpm >= MIN_MOTION_BPM && scene.motion_bpm <= MAX_MOTION_BPM)) return `scene "${id}": motion_bpm must be from ${MIN_MOTION_BPM} to ${MAX_MOTION_BPM}`;
  }
  return '';
}

/** What a run of the mock leaves of the part the model chose for a scene made with `auto`; none for any other scene. */
export function motionChoice(project, sceneId) {
  const scene = (project?.scenes ?? []).find((s) => s?.id === sceneId);
  if (scene?.motion_part !== 'auto') return null;
  const part = PARTS.find((p) => !p.manual) ?? PARTS[0];
  return { part: part.name, params: Object.fromEntries(part.params.map((q) => [q.name, q.type === 'bool' ? q.default === 'true' : q.type === 'int' || q.type === 'number' ? Number(q.default) : q.default])) };
}
