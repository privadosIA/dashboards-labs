/**
 * A name for a new source file that none of `taken` has: `base.mp3`, then
 * `base-2.mp3`… Characters the server does not accept become `-`.
 */
export function freeSourceName(wanted: string, taken: readonly string[]): string {
  const clean = wanted.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[^A-Za-z0-9]+/, '') || 'origen';
  const used = new Set(taken);
  if (!used.has(clean)) return clean;
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  let n = 2;
  while (used.has(`${stem}-${n}${ext}`)) n++;
  return `${stem}-${n}${ext}`;
}

const VIDEO_EXT = /\.(mp4|mov|mkv|webm|avi)$/i;

/** Whether the file is a video, whose audio the server extracts into an mp3 source. */
export function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name);
}

/**
 * The name an uploaded file will be stored under: a video becomes `<name>.mp3`
 * (the server extracts its audio), then a free name is found among `taken`.
 */
export function uploadSourceName(fileName: string, taken: readonly string[]): string {
  return freeSourceName(isVideoFile(fileName) ? fileName.replace(VIDEO_EXT, '.mp3') : fileName, taken);
}

const CLIP_EXT = /\.(gif|mp4|mov|mkv|webm|avi)$/i;

/** Whether the file is a GIF or a video, which a starting-picture upload reduces to its first frame. */
export function isClipFile(name: string): boolean {
  return CLIP_EXT.test(name);
}

/** The name a starting picture is stored under: a GIF or video becomes `<name>.png`, then a free name is found. */
export function pictureUploadName(fileName: string, taken: readonly string[]): string {
  return freeSourceName(isClipFile(fileName) ? fileName.replace(CLIP_EXT, '.png') : fileName, taken);
}

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Whether the file is a picture a scene can use. */
export function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name);
}

const KEEP_VIDEO_EXT = /\.(mp4|mov|mkv|webm)$/i;

/** Whether the file is a video the server can keep as a video (an .avi cannot: only its audio can be taken). */
export function isKeepableVideo(name: string): boolean {
  return KEEP_VIDEO_EXT.test(name);
}
