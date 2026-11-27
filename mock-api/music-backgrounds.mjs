// The video backgrounds of a music-motion piece, as the contract describes them (`/api/music-motion/pieces/{id}/backgrounds`): the pure parts of the mock's answer.
// A background is a video a piece keeps (uploaded, or copied from a finished generation) so that a piece of its script can play it behind everything it draws.
// The mock has no ffprobe and no video: an upload is read by its first bytes, its length is the length the generation was asked for (4 s for an upload), and every
// background plays the one placeholder video (`assets/placeholder.mp4`).
import { createHash } from 'node:crypto';
import { playedBy as vtPlayedBy } from './music-video-track.mjs';

export const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}\.(mp4|mov|webm|mkv)$/i;
export const MAX_BYTES = 256 * 1024 * 1024;
const err = (status, code, message) => [status, { error: { code, message } }];

/** The size of the frame a generation of that shape makes (the mock draws none, it only says it). */
const FRAME = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [720, 720], '4:3': [960, 720], '3:4': [720, 960] };
export const frameOf = (aspect) => FRAME[aspect] ?? FRAME['16:9'];

/** Whether the bytes begin like an MP4/MOV (`ftyp`) or a WebM/MKV (EBML): all the mock can tell of a video. */
export function looksLikeVideo(buffer) {
  if (!buffer || buffer.length < 12) return false;
  const mp4 = buffer.subarray(4, 8).toString('latin1') === 'ftyp';
  const ebml = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  return mp4 || ebml;
}

/** The pieces of the saved script that play background `name`: the ones an item of the video track that plays it touches. */
export const playedBy = vtPlayedBy;

/** The list the contract describes: sorted by name, each with its `used_by`. */
export const listOf = (files, script) =>
  Object.entries(files)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, f]) => ({ name, seconds: f.seconds, width: f.width, height: f.height, fps: f.fps, size: f.size, source: f.source, used_by: playedBy(script, name) }));

export const madeOf = (name, f) => ({ name, seconds: f.seconds, width: f.width, height: f.height, fps: f.fps });

/** The generation a copy comes from, or the refusal: 422 for a `from` that is not `generation:<id>`, 404 for one that is not there, 409 for one that is not done. */
export function sourceOf(from, generations, stateOf, { adultKept }) {
  const match = /^generation:(.+)$/.exec(typeof from === 'string' ? from : '');
  if (!match) return { refused: err(422, 'validation_failed', 'from: say the video as generation:<id>') };
  const rec = generations[match[1]];
  if (!rec || (rec.request?.adult === true && !adultKept)) return { refused: err(404, 'not_found', `generation "${match[1]}" not found`) };
  const st = stateOf(rec);
  if (st.state !== 'done') return { refused: err(409, 'conflict', `the generation ${match[1]} is ${st.state}: wait for it to be done`) };
  return { id: match[1], rec };
}

/** The sample video, served with its ETag, `Range` and `If-None-Match` like the server's file of a background. */
export function fileAnswer(file, request) {
  const etag = `"${createHash('sha1').update(file).digest('hex').slice(0, 16)}"`;
  const headers = { ETag: etag, 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes' };
  if (request['if-none-match'] === etag) return [304, undefined, undefined, headers];
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.range ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] === '' ? Math.max(0, file.length - Number(range[2])) : Number(range[1]);
    const end = range[1] === '' || range[2] === '' ? file.length - 1 : Math.min(Number(range[2]), file.length - 1);
    if (start <= end && start < file.length) return [206, file.subarray(start, end + 1), 'video/mp4', { ...headers, 'Content-Range': `bytes ${start}-${end}/${file.length}` }];
  }
  return [200, file, 'video/mp4', headers];
}
