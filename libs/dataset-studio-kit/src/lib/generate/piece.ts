import { type Catalog, type AssistedPlan, FRAME_RATES, LEVELS, MODES, STYLES, type Level, type Style } from '@lab/animation-core';
import { type AnimationDataset, DATASET_FORMAT, DATASET_VERSION, type FilePart } from '@lab/animation-dataset';

/** The song to choose or make: the dataset needs a project and a track to name, and until the song exists they say so. */
export const SONG_TO_CHOOSE = 'to-choose';

const oneOf = <T extends string | number>(value: unknown, list: readonly T[], fallback: T): T => ((list as readonly unknown[]).includes(value) ? (value as T) : fallback);
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/**
 * The animated piece the plan describes, as a `music-motion-dataset` v2 **without a script**: the title, the song to be chosen or made (named `to-choose` until it exists), the options from the plan, the design's
 * concept from the sentence and the parts with the request that asks for each draft. The script is written by the server's proposer once the song exists; here it is empty.
 */
export function composePiece(plan: AssistedPlan, catalog: Pick<Catalog, 'fonts'>, resolution = '1280x720'): AnimationDataset {
  const title = (plan.song.title || plan.animation.concept || 'Untitled').slice(0, 120);
  const font = catalog.fonts[0] ?? 'Inter';
  const missing: FilePart[] = plan.parts.filter((p) => !p.exists).map((p) => ({ name: p.name, description: (p.request ?? '').slice(0, 500), text: null }));
  return {
    format: DATASET_FORMAT,
    version: DATASET_VERSION,
    animation: {
      title,
      song: { project: SONG_TO_CHOOSE, trackId: SONG_TO_CHOOSE, variant: 0, title, seconds: clamp(plan.song.seconds || 180, 1, 7200) },
      options: { style: oneOf<Style>(plan.animation.style, STYLES, 'typographic'), level: oneOf<Level>(plan.animation.level, LEVELS, 'simple'), fps: oneOf(plan.animation.fps, FRAME_RATES, 30), resolution },
      design: {
        dark: '#14101c',
        light: '#f6f3ee',
        accent: '#2dd4bf',
        display: font,
        body: font,
        defaultMode: oneOf(plan.animation.mode, MODES, 'dark'),
        modes: {},
        concept: plan.animation.concept.slice(0, 500),
      },
      script: { version: 1, pieces: [] },
      ...(missing.length ? { parts: missing } : {}),
    },
  };
}
