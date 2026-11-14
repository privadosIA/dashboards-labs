import { NO_REFERENCES, START_ONLY, takesReferences, type GenerationSettings, type ModelInputs, type References } from './model';

/** What a model takes: what it announces, or a start image only when it announces nothing. */
export const inputsOf = (model?: { inputs?: ModelInputs }): ModelInputs => model?.inputs ?? START_ONLY;

export interface InputCounts {
  start: number;
  end: number;
  images: number;
  videos: number;
  audios: number;
}

/** How many of each input a set of settings carries, counting the files the server keeps for it (`reuse`). */
export function countInputs(settings: GenerationSettings): InputCounts {
  const kept = settings.reuse?.inputs ?? [];
  const own = (kind: string): number => kept.filter((i) => i.kind === kind).length;
  const refs = settings.references ?? NO_REFERENCES;
  return {
    start: (settings.startImage ? 1 : 0) + own('start_image'),
    end: (settings.endImage ? 1 : 0) + own('end_image'),
    images: refs.images.length + own('reference_image'),
    videos: refs.videos.length + own('reference_video'),
    audios: refs.audios.length + own('reference_audio'),
  };
}

/** Whether the settings carry an image the prompt can lean on: the start image or the first reference image. */
export const hasAnyImage = (settings: GenerationSettings): boolean => {
  const c = countInputs(settings);
  return c.start + c.images > 0;
};

/** The same settings without the inputs the model does not take (they stay in the panel, but are not sent). */
export function forModel(settings: GenerationSettings, inputs: ModelInputs): GenerationSettings {
  const refs: References = settings.references ?? NO_REFERENCES;
  const out: GenerationSettings = { ...settings };
  const keep = takesReferences(inputs);
  if (!inputs.startImage || keep) out.startImage = null;
  if (!inputs.endImage || keep) out.endImage = null;
  out.references = keep
    ? { images: inputs.referenceImages?.max ? refs.images : [], videos: inputs.referenceVideos?.max ? refs.videos : [], audios: inputs.referenceAudios?.max ? refs.audios : [] }
    : NO_REFERENCES;
  if (settings.reuse) {
    const accepted = (kind: string): boolean =>
      kind === 'start_image' ? inputs.startImage && !keep : kind === 'end_image' ? inputs.endImage && !keep : kind === 'reference_image' ? !!inputs.referenceImages?.max : kind === 'reference_video' ? !!inputs.referenceVideos?.max : !!inputs.referenceAudios?.max;
    // The server reuses all the files of the source or none: a model that cannot take one of them takes none.
    out.reuse = settings.reuse.inputs.every((i) => accepted(i.kind)) ? settings.reuse : undefined;
  }
  return out;
}

/** Whether the settings carry any file to send (a request with only JSON goes as JSON, and one that reuses files sends none). */
export const carriesFiles = (s: GenerationSettings): boolean => {
  const r = s.references ?? NO_REFERENCES;
  return !!s.startImage || !!s.endImage || r.images.length + r.videos.length + r.audios.length > 0;
};
