// The client labels of the server, simulated: `GET /api/clients` (the labels in use, with their counts and colours) and
// `PUT /api/clients/{name}` (the colour the owner chose, kept in `db.clientColors`). The shared rules of the `PATCH {client}` of
// each kind of item live here too, so the generations, the edits and the 3D generations answer the same 400s.
import { createHash } from 'node:crypto';

const NAME = /^[a-z0-9-]{1,32}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const err = (status, code, message) => [status, { error: { code, message } }];

/** `#rrggbb` of an HSL colour (h in degrees, s and l from 0 to 1). */
function hex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[0, 8, 4].map((n) => channel(n).toString(16).padStart(2, '0')).join('')}`;
}

/** The default colour of a label, as the contract works it out: the hue is the first four bytes of the SHA-256 of the name, big-endian, modulo 360; saturation 55 %, lightness 50 %. */
export function defaultColor(name) {
  const hue = createHash('sha256').update(name).digest().readUInt32BE(0) % 360;
  return hex(hue, 0.55, 0.5);
}

/**
 * The body of a `PATCH {client}` as the server reads it: only `client`, a valid name, or `null` / an empty text to remove it
 * (`unknown` applies again). `{ client }` on success; anything else is a ready-made 400.
 */
export function readClientPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: err(400, 'invalid_request', 'invalid JSON body') };
  const other = Object.keys(body).find((k) => k !== 'client');
  if (other !== undefined) return { error: err(400, 'invalid_request', `${other}: cannot be changed this way (only client can)`) };
  if (!('client' in body)) return { error: err(400, 'invalid_request', 'client: say the client name, or null to remove it') };
  if (body.client === null || body.client === '') return { client: 'unknown' };
  if (typeof body.client !== 'string' || !NAME.test(body.client)) return { error: err(400, 'invalid_request', 'client: one to 32 lower-case letters, digits or hyphens') };
  return { client: body.client };
}

/**
 * `items()` lists what the server shows as `{ client, kind, at }` (`kind` is a key of `counts`; `at` the creation or update);
 * the handlers read it again on each call, so a relabel shows at once.
 */
export function clientsHandlers({ db, save, items }) {
  const colors = () => (db.clientColors ??= {});
  const colorOf = (name) => colors()[name] ?? defaultColor(name);
  return {
    'GET /api/clients': () => {
      const by = new Map();
      for (const { client, kind, at } of items()) {
        const row = by.get(client) ?? { name: client, color: colorOf(client), counts: { projects: 0, animations: 0, generations: 0, image_edits: 0, video_edits: 0, model_generations: 0 }, total: 0, last_used: '' };
        row.counts[kind]++;
        row.total++;
        if (at && at > row.last_used) row.last_used = at;
        by.set(client, row);
      }
      const list = [...by.values()].sort((a, b) => (a.last_used === b.last_used ? (a.name < b.name ? -1 : 1) : a.last_used < b.last_used ? 1 : -1));
      return [200, list];
    },
    'PUT /api/clients/{name}': ({ params, body }) => {
      if (params.name !== 'embedded' && params.name !== 'unknown' && !NAME.test(params.name)) return err(400, 'invalid_request', 'name: embedded, unknown or one to 32 lower-case letters, digits or hyphens');
      if (!body || typeof body !== 'object' || Array.isArray(body) || !('color' in body)) return err(400, 'invalid_request', 'color: say #rrggbb, or null for the default colour');
      if (body.color !== null && !(typeof body.color === 'string' && COLOR.test(body.color))) return err(400, 'invalid_request', 'color: must be #rrggbb');
      if (body.color === null) delete colors()[params.name];
      else colors()[params.name] = body.color.toLowerCase();
      save();
      return [200, { name: params.name, color: colorOf(params.name) }];
    },
  };
}
