// What the server keeps in its database, simulated: the versions of the definition of a project and its details, the
// song library with its stars and the playlists. A write changes the next read; the statuses and shapes are the
// contract's, the rest (what the server checks) is a simplification. The state lives in `db` (defaulted here, so an old
// `--persist` file still loads): `db.versions` (by project), `db.updated` (the last change of a project), `db.ratings`
// (by song key) and `db.playlists`.
import * as fx from './fixtures.mjs';

const err = (status, code, message) => [status, { error: { code, message } }];
const CLIENT_RE = /^[a-z0-9-]{1,32}$/;
const KEPT_VERSIONS = 20;
const MAX_PLAYLISTS = 200;
const MAX_SONGS = 2000;
const MAX_NAME = 80;

/** The songs of the library: the ones of the fixtures and, with `MOCK_BULK`, the generated ones. */
export const allSongs = (db) => [...fx.LIBRARY_SONGS, ...(db.bulk?.songs ?? [])];

/** Where the label of each kind of item is changed: its own route, not the one of projects. */
const OWN_CLIENT_ROUTE = {
  'api-gen-': '/api/generations/{id}',
  'api-edit-': '/api/image-edits/{id}',
  'api-vid-': '/api/video-edits/{id}',
  'api-m3d-': '/api/models3d/generations/{id}',
  'api-mm-': '/api/music-motion/pieces/{id}',
};

export function databaseHandlers({ db, save, ts, parse, summary, clientOf, listQuery, wanted, hasActiveRun, pieceRow }) {
  db.versions ??= {};
  db.updated ??= {};
  db.ratings ??= {};
  db.playlists ??= [];

  const noProject = (id) => err(404, 'not_found', `project "${id}" not found`);

  // ------------------------------------------------------------ versions of the definition
  /** Keeps the text that a save replaces as a version (nothing when the text did not change) and notes the date of the change. */
  function recordVersion(id, before, after, reason) {
    db.updated[id] = ts();
    if (before === undefined || before === after) return;
    const list = (db.versions[id] ??= []);
    list.push({ version: (list.at(-1)?.version ?? 0) + 1, created_at: ts(), reason, bytes: Buffer.byteLength(before), yaml: before });
    while (list.length > KEPT_VERSIONS) list.shift();
  }
  const versionView = ({ yaml, ...v }) => v;

  // ------------------------------------------------------------ songs, stars and playlists
  const songsOf = (query) => {
    const ok = wanted(query);
    return allSongs(db)
      .filter((s) => ok(s.project))
      .map((s) => ({ ...s, client: clientOf(s.project), ...(db.ratings[s.key] ? { rating: db.ratings[s.key] } : {}) }));
  };
  const keyOf = (s) => s.key;
  const slug = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  /** A playlist as a request names it, checked as the server does: `{ error }` is a 422 (or 400) answer, `{ value }` the clean playlist. */
  function readPlaylist(body, id) {
    if (!body || typeof body !== 'object') return { error: err(400, 'invalid_request', 'invalid JSON body') };
    if (typeof body.name !== 'string' || !body.name.trim()) return { error: err(400, 'invalid_request', 'name is required') };
    if (body.name.length > MAX_NAME) return { error: err(422, 'unprocessable', `name: up to ${MAX_NAME} characters`) };
    const songs = body.songs ?? [];
    if (!Array.isArray(songs) || songs.some((k) => typeof k !== 'string')) return { error: err(400, 'invalid_request', 'songs: a list of song keys') };
    if (songs.length > MAX_SONGS) return { error: err(422, 'unprocessable', `songs: up to ${MAX_SONGS}`) };
    const known = new Set(allSongs(db).map(keyOf));
    const missing = songs.find((k) => !known.has(k));
    if (missing !== undefined) return { error: err(422, 'unprocessable', `songs: "${missing}" is not a song of the library`) };
    const made = id ?? (typeof body.id === 'string' && body.id ? body.id : slug(body.name));
    if (!/^[a-z0-9][a-z0-9-]*$/.test(made)) return { error: err(422, 'unprocessable', 'id: lowercase letters, digits and hyphens') };
    return { value: { id: made, name: body.name.trim(), songs } };
  }
  const playlistOf = (id) => db.playlists.find((p) => p.id === id);
  const noPlaylist = (id) => err(404, 'not_found', `playlist "${id}" not found`);
  const noSong = (key) => err(404, 'not_found', `song "${key}" not found`);

  const handlers = {
    // ---------------------------------------------------------- one project and its definition
    'GET /api/projects/{id}': ({ params }) => (db.pieces?.[params.id] ? [200, pieceRow(db.pieces[params.id])] : db.projects[params.id] === undefined ? noProject(params.id) : [200, summary(params.id)]),
    'PATCH /api/projects/{id}': ({ params, body }) => {
      // the label of an item of the generation API or of an animation is changed by the route of its kind, as the server says (name and adult still go this way)
      const own = Object.entries(OWN_CLIENT_ROUTE).find(([prefix]) => params.id.startsWith(prefix));
      if (own && body && typeof body === 'object' && 'client' in body) return err(400, 'invalid_request', `client: change the label of this item with PATCH ${own[1]}`);
      // an animation keeps its name and its adult label in its project (its client goes by its own route, refused above)
      const piece = db.pieces?.[params.id];
      if (piece && body && typeof body === 'object' && !Array.isArray(body)) {
        const unknown = Object.keys(body).find((k) => !['name', 'adult'].includes(k));
        if (unknown !== undefined) return err(400, 'invalid_request', `${unknown}: cannot be changed this way (name and adult can)`);
        if ('name' in body) piece.projectName = String(body.name);
        if ('adult' in body) body.adult === null ? delete piece.adult : (piece.adult = body.adult === true);
        save();
        return [200, pieceRow(piece)];
      }
      const text = db.projects[params.id];
      if (text === undefined) return noProject(params.id);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return err(400, 'invalid_request', 'invalid JSON body');
      const unknown = Object.keys(body).find((k) => !['name', 'client', 'adult'].includes(k));
      if (unknown !== undefined) return err(400, 'invalid_request', `${unknown}: cannot be changed this way (name, client and adult can)`);
      if (!Object.keys(body).length) return err(400, 'invalid_request', 'say at least one of name, client, adult');
      if (hasActiveRun(params.id)) return err(409, 'conflict', 'project has an active run');
      if (!parse(text).value) return err(422, 'validation_failed', 'config: the definition cannot be read');
      // the real server's rule for the declared name of a project (the same as an id)
      if ('name' in body && !(typeof body.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(body.name.trim()))) return err(422, 'validation_failed', `config: project ${JSON.stringify(body.name)} is not valid: use letters, digits, '.', '_' and '-' (at most 64, not starting with a symbol)`);
      if ('client' in body && body.client !== null && body.client !== '' && !(typeof body.client === 'string' && CLIENT_RE.test(body.client))) return err(422, 'unprocessable', 'client: not a valid client name');
      if ('adult' in body && body.adult !== null && typeof body.adult !== 'boolean') return err(422, 'unprocessable', 'adult: true, false or null');
      // written into the text as a save does, keeping its comments and its order: a line of the top level is replaced, removed or added after the first one
      let next = text;
      const set = (key, value) => {
        const line = new RegExp(`^${key}:.*\\n?`, 'm');
        if (value === null) return void (next = next.replace(line, ''));
        const written = `${key}: ${typeof value === 'string' ? JSON.stringify(value) : value}\n`;
        next = line.test(next) ? next.replace(line, written) : next.replace(/^(.*\n)/, `$1${written}`);
      };
      if ('name' in body) set('project', body.name.trim());
      if ('client' in body) set('client', body.client === '' ? null : body.client);
      if ('adult' in body) set('adult', body.adult);
      if (!parse(next).value) return err(422, 'validation_failed', 'config: the loader refuses the value');
      db.projects[params.id] = next;
      recordVersion(params.id, text, next, 'patch');
      save();
      return [200, summary(params.id)];
    },
    'GET /api/projects/{id}/versions': ({ params, page }) => {
      if (db.pieces?.[params.id]) return page([]); // the project of an animation has no versions of a definition
      if (db.projects[params.id] === undefined) return noProject(params.id);
      // newest first, as the list is answered when nothing is asked
      return page((db.versions[params.id] ?? []).map(versionView).reverse());
    },
    'GET /api/projects/{id}/versions/{version}': ({ params }) => {
      if (db.projects[params.id] === undefined) return noProject(params.id);
      const v = (db.versions[params.id] ?? []).find((x) => String(x.version) === params.version);
      return v ? [200, v] : err(404, 'not_found', `version ${params.version} of project "${params.id}" not found`);
    },
    'POST /api/projects/{id}/versions/{version}/restore': ({ params }) => {
      const text = db.projects[params.id];
      if (text === undefined) return noProject(params.id);
      const v = (db.versions[params.id] ?? []).find((x) => String(x.version) === params.version);
      if (!v) return err(404, 'not_found', `version ${params.version} of project "${params.id}" not found`);
      if (hasActiveRun(params.id)) return err(409, 'conflict', 'project has an active or queued run');
      if (!parse(v.yaml).value) return err(422, 'validation_failed', 'config: the text of that version is no longer valid');
      db.projects[params.id] = v.yaml;
      recordVersion(params.id, text, v.yaml, 'restore');
      save();
      return [200, { restored: v.version, project: summary(params.id) }];
    },

    // ---------------------------------------------------------- the library
    'GET /api/library': ({ query }) => {
      const base = listQuery(query);
      if (base) return base;
      const songs = songsOf(query);
      // this older list has no `generator` and no `rating` per song: the stars come in `ratings`
      return [200, { ratings: { ...db.ratings }, playlists: db.playlists.map((p) => ({ ...p })), songs: songs.map(({ generator, rating, ...s }) => s) }];
    },
    'PUT /api/library/meta': ({ body }) => {
      if (!body || typeof body !== 'object') return err(422, 'unprocessable', 'invalid JSON body');
      const known = new Set(allSongs(db).map(keyOf));
      const ratings = {};
      for (const [key, stars] of Object.entries(body.ratings ?? db.ratings)) {
        if (!Number.isInteger(stars) || stars < 1 || stars > 5) return err(422, 'unprocessable', `ratings: the stars of "${key}" are 1 to 5`);
        if (known.has(key)) ratings[key] = stars;
      }
      const playlists = [];
      if (body.playlists !== undefined && !Array.isArray(body.playlists)) return err(422, 'unprocessable', 'playlists: a list');
      if ((body.playlists ?? []).length > MAX_PLAYLISTS) return err(422, 'unprocessable', `playlists: up to ${MAX_PLAYLISTS}`);
      for (const p of body.playlists ?? db.playlists) {
        const r = readPlaylist({ ...p, songs: (p.songs ?? []).filter((k) => known.has(k)) }, typeof p.id === 'string' ? p.id : undefined);
        if (r.error) return r.error;
        playlists.push(r.value);
      }
      db.ratings = ratings;
      db.playlists = playlists;
      save();
      return [200, { ratings, playlists }];
    },
    'GET /api/library/songs': ({ query, page }) => {
      const base = listQuery(query);
      if (base) return base;
      let songs = songsOf(query);
      const project = query.get('project');
      if (project) songs = songs.filter((s) => s.project === project);
      if (query.has('generator')) {
        const generator = query.get('generator');
        if (!['ace-step', 'heartmula', 'diffrhythm2'].includes(generator)) return err(400, 'invalid_request', 'generator must be ace-step, heartmula or diffrhythm2');
        songs = songs.filter((s) => (s.generator ?? 'ace-step') === generator);
      }
      if (query.has('min_rating')) {
        const min = Number(query.get('min_rating'));
        if (!Number.isInteger(min) || min < 1 || min > 5) return err(400, 'invalid_request', 'min_rating: a whole number from 1 to 5');
        songs = songs.filter((s) => (s.rating ?? 0) >= min);
      }
      if (query.has('favorite')) {
        if (query.get('favorite') !== 'true') return err(400, 'invalid_request', 'favorite: the only value is true');
        songs = songs.filter((s) => s.favorite);
      }
      const listed = query.get('playlist');
      if (listed !== null) {
        const p = playlistOf(listed);
        if (!p) return noPlaylist(listed);
        const at = new Map(p.songs.map((k, i) => [k, i]));
        songs = songs.filter((s) => at.has(s.key)).sort((a, b) => at.get(a.key) - at.get(b.key));
      }
      return page(songs, { search: ['title', 'caption', 'lyrics'], by: { created_at: (s) => s.generated_at, duration: (s) => s.duration ?? s.audio_seconds }, natural: listed !== null });
    },
    'GET /api/library/songs/{key}': ({ params, query }) => {
      const song = songsOf(query).find((s) => s.key === params.key);
      return song ? [200, song] : noSong(params.key);
    },
    'PUT /api/library/songs/{key}/rating': ({ params, body }) => {
      const song = allSongs(db).find((s) => s.key === params.key);
      if (!song) return noSong(params.key);
      if (!body || typeof body !== 'object' || !('stars' in body)) return err(400, 'invalid_request', 'stars is required');
      if (!Number.isInteger(body.stars) || body.stars < 0 || body.stars > 5) return err(422, 'unprocessable', 'stars: a whole number from 0 (none) to 5');
      if (body.stars === 0) delete db.ratings[song.key];
      else db.ratings[song.key] = body.stars;
      save();
      return [200, { ...song, client: clientOf(song.project), ...(body.stars ? { rating: body.stars } : {}) }];
    },
    'POST /api/library/rescan': () => [200, { added: 0, updated: 0, removed: 0 }],

    // ---------------------------------------------------------- playlists
    // the list answers a summary of each: how many songs it has, not the keys
    'GET /api/library/playlists': () => [200, db.playlists.map((p) => ({ id: p.id, name: p.name, songs: p.songs.length }))],
    'POST /api/library/playlists': ({ body }) => {
      const r = readPlaylist(body);
      if (r.error) return r.error;
      if (db.playlists.length >= MAX_PLAYLISTS) return err(422, 'unprocessable', `up to ${MAX_PLAYLISTS} playlists`);
      if (playlistOf(r.value.id)) return err(409, 'conflict', `playlist "${r.value.id}" already exists`);
      db.playlists.push(r.value);
      save();
      return [201, r.value];
    },
    'GET /api/library/playlists/{id}': ({ params }) => {
      const p = playlistOf(params.id);
      return p ? [200, { ...p }] : noPlaylist(params.id);
    },
    'PUT /api/library/playlists/{id}': ({ params, body }) => {
      const p = playlistOf(params.id);
      if (!p) return noPlaylist(params.id);
      const r = readPlaylist(body, params.id);
      if (r.error) return r.error;
      Object.assign(p, r.value);
      save();
      return [200, { ...p }];
    },
    'DELETE /api/library/playlists/{id}': ({ params }) => {
      if (!playlistOf(params.id)) return noPlaylist(params.id);
      db.playlists = db.playlists.filter((p) => p.id !== params.id);
      save();
      return [204];
    },
  };

  return { handlers, recordVersion };
}
