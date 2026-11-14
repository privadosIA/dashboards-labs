import { blobToDataUrl } from '../shared/data-url';
import { NO_REFERENCES, type GenerationInput, type ReferenceFile, type References, type StartImage } from './model';

export interface LoadedInputs {
  startImage: StartImage | null;
  endImage: StartImage | null;
  references: References;
}

/**
 * The files a generation used, read back from the server's read-only addresses so the person can change one of them and
 * generate again (the server only reuses all of them or none). `address` turns each address into one that can be fetched
 * (with its ticket). Rejects when any of them cannot be read.
 */
export async function loadInputs(inputs: readonly GenerationInput[], address: (url: string) => string = (u) => u, fetcher: typeof fetch = fetch): Promise<LoadedInputs> {
  const out = { startImage: null as StartImage | null, endImage: null as StartImage | null, images: [] as ReferenceFile[], videos: [] as ReferenceFile[], audios: [] as ReferenceFile[] };
  for (const input of inputs) {
    const res = await fetcher(address(input.url));
    if (!res.ok) throw new Error(`${input.name}: ${res.status}`);
    const blob = await res.blob();
    if (input.kind === 'start_image') out.startImage = { name: input.name, dataUrl: await blobToDataUrl(blob) };
    else if (input.kind === 'end_image') out.endImage = { name: input.name, dataUrl: await blobToDataUrl(blob) };
    else if (input.kind === 'reference_image') out.images.push({ name: input.name, blob });
    else if (input.kind === 'reference_video') out.videos.push({ name: input.name, blob });
    else out.audios.push({ name: input.name, blob });
  }
  return { startImage: out.startImage, endImage: out.endImage, references: { ...NO_REFERENCES, images: out.images, videos: out.videos, audios: out.audios } };
}
