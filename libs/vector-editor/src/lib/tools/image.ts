/** The picture types the editor reads, and the biggest file it takes. */
export const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Over this the person is told the part will be heavy: the picture is in the part twice (drawing and model) and goes into every page of the script. */
export const WARN_IMAGE_BYTES = 300 * 1024;

export type ImageProblem = 'type' | 'size';

/** Why a file cannot be an image node, if it cannot. */
export function checkImage(file: { type: string; size: number }): ImageProblem | undefined {
  if (!IMAGE_TYPES.includes(file.type)) return 'type';
  if (file.size > MAX_IMAGE_BYTES) return 'size';
  return undefined;
}

/** The size a picture takes on the artboard: its own, shrunk to fit `share` of each side when it would not (never enlarged). */
export function fitImage(natural: { width: number; height: number }, artboard: { width: number; height: number }, share = 0.5): { width: number; height: number } {
  const w = natural.width > 0 ? natural.width : artboard.width * share;
  const h = natural.height > 0 ? natural.height : artboard.height * share;
  const k = Math.min(1, (artboard.width * share) / w, (artboard.height * share) / h);
  return { width: Math.round(w * k * 100) / 100, height: Math.round(h * k * 100) / 100 };
}

export interface ReadImage {
  source: string;
  width: number;
  height: number;
  bytes: number;
  /** The file is heavy enough to warn about. */
  large: boolean;
}

/** Reads a picture file into a `data:` URL and measures it, in the browser. */
export function readImage(file: File): Promise<ReadImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const source = String(reader.result);
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => resolve({ source, width: img.naturalWidth, height: img.naturalHeight, bytes: file.size, large: file.size > WARN_IMAGE_BYTES });
      img.src = source;
    };
    reader.readAsDataURL(file);
  });
}
