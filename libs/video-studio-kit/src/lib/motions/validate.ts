import type { MotionRequest } from './model';

const VIDEO_FILE = /\.(mp4|mov|webm|mkv)$/i;
const HTTP_ADDRESS = /^https?:\/\/\S+$/i;

/** The problems of a request before it is sent, empty when it is valid. */
export function validateMotion(request: Partial<MotionRequest>): string[] {
  const source = request.source?.trim();
  if (request.video && source) return ['choose a video or an address, not both'];
  if (source) return HTTP_ADDRESS.test(source) ? [] : ['the address must start with http:// or https://'];
  if (!request.video) return ['a video or an address is needed'];
  return VIDEO_FILE.test(request.video.name) ? [] : ['the video must be an .mp4, .mov, .webm or .mkv file'];
}

/** Thrown (through the Observable) when a motion is refused, here or by the server; nothing was added. */
export class MotionRefused extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join('; '));
    this.name = 'MotionRefused';
  }
}

/** Thrown when the library could not be read, so the studio can say so instead of showing it empty. */
export class MotionsUnreadable extends Error {
  constructor(readonly reason: string) {
    super(`the library of motions could not be read: ${reason}`);
    this.name = 'MotionsUnreadable';
  }
}
