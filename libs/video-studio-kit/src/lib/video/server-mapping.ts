/**
 * What the studio says and what the server says are not the same words: the studio's qualities are resolutions, the
 * server's are levels. These pure functions are the whole translation, so the adapter has none of it inline.
 */
import type { components } from '@lab/api-client';

import { STUDIO_CLIENT } from '../core/client';
import { fullPrompt } from './prompt';
import { ASPECT_RATIOS, START_ONLY, type AspectRatio, type Generation, type GenerationInput, type GenerationSettings, type InputLimit, type ModelInputs, type Quality } from './model';

export type ServerGeneration = components['schemas']['Generation'];
export type ServerGenerationRequest = components['schemas']['GenerationRequest'];
export type ServerVideoOption = components['schemas']['VideoOption'];
type ServerInputs = components['schemas']['GenerationInputs'];
type ServerLimit = components['schemas']['InputLimit'];

const limit = (l?: ServerLimit): InputLimit | undefined => (l && l.max > 0 ? { max: l.max, ...(l.min !== undefined ? { min: l.min } : {}), ...(l.max_seconds !== undefined ? { maxSeconds: l.max_seconds } : {}) } : undefined);

/** What an option accepts, as the studio holds it; an option that announces nothing takes a start image only. */
export function toModelInputs(inputs?: ServerInputs): ModelInputs {
  if (!inputs) return START_ONLY;
  const out: ModelInputs = { startImage: inputs.start_image, endImage: inputs.end_image };
  const images = limit(inputs.reference_images);
  const videos = limit(inputs.reference_videos);
  const audios = limit(inputs.reference_audios);
  if (images) out.referenceImages = images;
  if (videos) out.referenceVideos = videos;
  if (audios) out.referenceAudios = audios;
  return out;
}

/** The files a generation used, with their addresses turned into ones a page can open. */
export const toInputs = (g: ServerGeneration, urlOf: (address: string) => string): GenerationInput[] => (g.inputs ?? []).map((i) => ({ kind: i.kind, name: i.name, url: urlOf(i.address) }));

const TO_SERVER: Record<Quality, NonNullable<ServerGenerationRequest['quality']>> = { '480p': 'draft', '720p': 'normal', '1080p': 'high' };
const FROM_SERVER: Record<NonNullable<ServerGenerationRequest['quality']>, Quality> = { draft: '480p', normal: '720p', high: '1080p' };

export const serverQuality = (q: Quality): NonNullable<ServerGenerationRequest['quality']> => TO_SERVER[q];
export const studioQuality = (q: ServerGenerationRequest['quality']): Quality => FROM_SERVER[q ?? 'high'] ?? '1080p';

/**
 * The request of a set of settings. `option` is left out when the studio asks for "the default"; `audio` only goes with an
 * option that can write it (the studio's default has audio on, and an option without it would refuse the request).
 */
export function toRequest(settings: GenerationSettings, option?: Pick<ServerVideoOption, 'audio'>, client = STUDIO_CLIENT): ServerGenerationRequest {
  const request: ServerGenerationRequest = {
    duration: settings.duration,
    aspect_ratio: settings.aspectRatio,
    quality: serverQuality(settings.quality),
    client,
  };
  const prompt = fullPrompt(settings, option?.audio !== false);
  if (prompt) request.prompt = prompt;
  if (settings.model) request.option = settings.model;
  if (settings.audio && option?.audio !== false) request.audio = true;
  if (settings.reuse) request.reuse_inputs_of = settings.reuse.of;
  return request;
}

/** The settings a server request stands for (without the start image: the server does not give it back). */
export function toSettings(request: ServerGenerationRequest): GenerationSettings {
  const ratio = request.aspect_ratio as AspectRatio | undefined;
  return {
    prompt: request.prompt ?? '',
    startImage: null,
    model: request.option ?? '',
    duration: request.duration ?? 5,
    aspectRatio: ratio && (ASPECT_RATIOS as readonly string[]).includes(ratio) ? ratio : '16:9',
    quality: studioQuality(request.quality),
    audio: !!request.audio,
    sound: '',
  };
}

/** A generation of the server as the studio holds it. `urlOf` turns the video address into one a `<video>` can open. */
export function toGeneration(g: ServerGeneration, urlOf: (address: string) => string, settings?: GenerationSettings): Generation {
  const inputs = toInputs(g, urlOf);
  const out: Generation = { id: g.id, settings: withReuse(settings ?? toSettings(g.request), g.id, inputs), state: g.state, progress: g.progress, inputs };
  if (g.created_at) out.createdAt = g.created_at;
  if (g.video) out.videoUrl = urlOf(g.video);
  if (g.error) out.error = g.error;
  return out;
}

/** Whatever files the page holds, the server keeps the ones it was given: repeating asks it to reuse them. */
const withReuse = (settings: GenerationSettings, id: string, inputs: readonly GenerationInput[]): GenerationSettings => (inputs.length ? { ...settings, reuse: { of: id, inputs } } : settings);
