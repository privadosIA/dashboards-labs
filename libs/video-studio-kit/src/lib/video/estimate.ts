import type { Estimate, GenerationSettings, Quality } from './model';

/** Seconds of work per second of video, and megabytes per second of video, for each quality. */
const SECONDS_PER_SECOND: Record<Quality, number> = { '480p': 2, '720p': 3.5, '1080p': 6 };
const MEGABYTES_PER_SECOND: Record<Quality, number> = { '480p': 0.4, '720p': 0.9, '1080p': 1.8 };
const QUEUE_SECONDS = 8;
const AUDIO_SECONDS_FACTOR = 1.1;
const AUDIO_MEGABYTES_PER_SECOND = 0.03;

/** A model of the cost of a generation. Pure: the same settings always give the same estimate, and more duration or quality never gives less. */
export function estimate(settings: Pick<GenerationSettings, 'duration' | 'quality' | 'audio'>): Estimate {
  const work = settings.duration * SECONDS_PER_SECOND[settings.quality] * (settings.audio ? AUDIO_SECONDS_FACTOR : 1);
  const size = settings.duration * (MEGABYTES_PER_SECOND[settings.quality] + (settings.audio ? AUDIO_MEGABYTES_PER_SECOND : 0));
  return { seconds: Math.round(QUEUE_SECONDS + work), megabytes: Math.round(size * 10) / 10 };
}
