// The data of the server as a database, simulated: `/api/data/status`, the import of the state that was kept in files, the
// cleaning of the files left behind and the export. The mock keeps no database: the tables are views of its own state, the
// "files left behind" are a number per entity, and an import only moves them from pending to done. What a screen needs
// to be drawn against is real: the states, the records, the skipped files, the refusals (`404` naming the entities, `409`
// while an import runs or for an entity not cleanly imported) and a zip that opens.
//
//   MOCK_DATA_FAIL=<entity>   the first import of that entity fails (the transaction is undone); the second one ends well
//   (the entities and their order are the real server's)
//   MOCK_IMPORT_MS=<ms>       how long an import holds the server (default 150), so a second request meets the `409`
import { allSongs } from './database.mjs';
import { zip } from './zip.mjs';

const err = (status, code, message) => [status, { error: { code, message } }];

/** The entities of the state that was kept in files, in the order their dependencies ask for. */
export const ENTITIES = ['hyperframes/blocks', 'library', 'motions', 'music-motion/learnings', 'music-motion/library', 'music-motion/part-drafts', 'music-motion/parts', 'music-motion/pieces', 'music-motion/presets', 'music-motion/references', 'music-motion/render-times', 'projects', 'prompts', 'settings'];

const MIGRATIONS = ['202610010900_core', '202610201500_runs', '202611040800_library', '202611110900_music_motion', '202611181200_history'];
const BYTES_PER_FILE = 2048;
const SECRET = /token|secret|password|key_set|accept/i;

export function dataHandlers({ db, save, ts, speed = 1 }) {
  db.data ??= { imports: [], cleaned: [], running: false, failed: [] };
  const started = ts();

  /** What each table holds, from the state of the mock. A secret is never part of a row. */
  const clean = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !SECRET.test(k)));
  const tables = () => ({
    schema_migrations: MIGRATIONS.map((id) => ({ id, applied_at: started })),
    projects: Object.entries(db.projects).map(([id, yaml]) => ({ id, yaml })),
    runs: db.runs.map(({ events, ...run }) => run),
    settings: Object.entries(db.settings).filter(([k]) => !SECRET.test(k)).map(([key, value]) => ({ key, value: JSON.stringify(value) })),
    providers: (db.providers ?? []).map(clean),
    library_songs: allSongs(db),
    library_ratings: Object.entries(db.ratings ?? {}).map(([key, stars]) => ({ key, stars })),
    library_playlists: db.playlists ?? [],
    project_versions: Object.entries(db.versions ?? {}).flatMap(([project, list]) => list.map((v) => ({ project, ...v }))),
    generations: Object.values(db.generations ?? {}),
    image_edits: Object.values(db.edits ?? {}),
    video_edits: Object.values(db.videoEdits ?? {}),
    motions: Object.values(db.motions ?? {}),
    music_pieces: Object.values(db.pieces ?? {}),
    music_parts: Object.values(db.parts ?? {}),
    music_part_drafts: Object.values(db.drafts ?? {}),
    music_references: Object.values(db.references ?? {}),
    music_presets: Object.values(db.presets ?? {}),
    music_learnings: Object.values(db.learnings ?? {}),
  });

  /** The state files an entity has left behind on disk: one per row it keeps, and the files that were never rows. */
  const filesOf = (entity) => {
    if (db.data.cleaned.includes(entity)) return 0;
    switch (entity) {
      case 'settings': return 1;
      case 'prompts': return 5;
      case 'projects': return 0; // the definition of a project is its own file and stays
      case 'library': return 1;
      case 'hyperframes/blocks': return Object.keys(db.blocks ?? {}).length;
      case 'motions': return Object.keys(db.motions ?? {}).length;
      case 'music-motion/library': return Object.keys(db.library?.characters ?? {}).length + Object.keys(db.library?.backgrounds ?? {}).length;
      case 'music-motion/render-times': return 1;
      case 'music-motion/references': return Object.keys(db.references ?? {}).length;
      case 'music-motion/presets': return Object.keys(db.presets ?? {}).length;
      case 'music-motion/parts': return Object.keys(db.parts ?? {}).length;
      case 'music-motion/part-drafts': return Object.keys(db.drafts ?? {}).length;
      case 'music-motion/pieces': return Object.keys(db.pieces ?? {}).length;
      case 'music-motion/learnings': return Object.keys(db.learnings ?? {}).length;
      default: return 0;
    }
  };
  const recordOf = (entity) => [...db.data.imports].reverse().find((r) => r.entity === entity);
  const imported = (entity) => recordOf(entity)?.state === 'done';
  /** An entity can be cleaned when its last import ended well and skipped no file. */
  const cleanable = (entity) => imported(entity) && recordOf(entity).skipped.length === 0;
  const unknown = (entity) => err(404, 'not_found', `no entity "${entity}"; they are ${ENTITIES.join(', ')}`);

  /** Imports one entity: the files that have no row become rows; the rows that are there are left as they are. */
  function importOne(entity) {
    const files = filesOf(entity);
    const record = { entity, state: 'done', created: files, existing: 0, skipped: [], started_at: ts() };
    const again = db.data.imports.some((r) => r.entity === entity);
    const failsNow = process.env.MOCK_DATA_FAIL === entity && !db.data.failed.includes(entity);
    if (failsNow) {
      db.data.failed.push(entity);
      Object.assign(record, { state: 'failed', created: 0, error: `${entity}: a row could not be written (simulated); the transaction was undone` });
    } else if (entity === 'prompts' && !again) {
      // a file that cannot be read is skipped and named; importing it again (the person fixed it) ends clean
      Object.assign(record, { created: files - 1, skipped: [{ path: 'prompts/broken-preset.json', reason: 'invalid JSON at line 3' }] });
    } else if (again) {
      Object.assign(record, { created: 0, existing: files });
    }
    record.finished_at = ts();
    db.data.imports.push(record);
    return record;
  }

  const handlers = {
    'GET /api/data/status': () => {
      const t = tables();
      const imports = ENTITIES.map(recordOf).filter(Boolean);
      return [
        200,
        {
          engine: 'sqlite',
          migrations: { applied: MIGRATIONS.map((id) => ({ id, applied_at: started })), pending: [] },
          tables: Object.entries(t).map(([name, rows]) => ({ name, rows: rows.length })),
          imports,
          legacy_files: ENTITIES.map((entity) => ({ entity, files: filesOf(entity), bytes: filesOf(entity) * BYTES_PER_FILE })),
        },
      ];
    },

    'POST /api/data/import': async ({ body }) => {
      const entity = body?.entity;
      if (entity !== undefined && typeof entity !== 'string') return err(400, 'invalid_request', 'entity: a text');
      if (entity !== undefined && !ENTITIES.includes(entity)) return unknown(entity);
      if (db.data.running) return err(409, 'conflict', 'another import is running');
      db.data.running = true;
      try {
        // the server holds the database for the length of the import: a second request meets the 409
        await new Promise((ok) => setTimeout(ok, Number(process.env.MOCK_IMPORT_MS ?? 150) / speed));
        const wanted = entity ? [entity] : ENTITIES.filter((e) => !imported(e));
        const records = wanted.map(importOne);
        save();
        return [200, { imports: records }];
      } finally {
        db.data.running = false;
      }
    },

    'POST /api/data/legacy/clean': ({ body }) => {
      const entities = body?.entities;
      if (!Array.isArray(entities) || !entities.length || entities.some((e) => typeof e !== 'string')) return err(400, 'invalid_request', 'entities: a list of at least one entity');
      const bad = entities.find((e) => !ENTITIES.includes(e));
      if (bad !== undefined) return unknown(bad);
      const notReady = entities.find((e) => !cleanable(e));
      // nothing of any entity is deleted when one of them cannot be
      if (notReady !== undefined) return err(409, 'conflict', `"${notReady}" has not been imported cleanly (it was not imported, it failed or it skipped a file), so its files are kept`);
      const cleaned = entities.map((entity) => ({ entity, deleted: filesOf(entity), bytes: filesOf(entity) * BYTES_PER_FILE }));
      for (const e of entities) if (!db.data.cleaned.includes(e)) db.data.cleaned.push(e);
      save();
      return [200, { cleaned }];
    },

    'GET /api/data/export': () => {
      const t = tables();
      const files = [
        { name: 'manifest.json', data: JSON.stringify({ engine: 'sqlite', migrations: MIGRATIONS, exported_at: ts(), tables: Object.fromEntries(Object.entries(t).map(([n, rows]) => [n, rows.length])) }, null, 2) },
        ...Object.entries(t).map(([name, rows]) => ({ name: `${name}.jsonl`, data: rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '') })),
      ];
      // named like the real server's: the date and the time, with no separators
      const stamp = ts().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-');
      return [200, zip(files), 'application/zip', { 'Content-Disposition': `attachment; filename="veritmo-data-${stamp}.zip"` }];
    },
  };

  return { handlers, tables };
}
