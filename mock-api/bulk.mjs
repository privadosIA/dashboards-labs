// `MOCK_BULK=<n>`: a mock with a lot in it, so a screen that pages, filters or searches has something to work on (the real
// server has 167 part drafts, most of them failed scenes). It adds `n` projects, library songs and part drafts to the sample
// data. Nothing here is random: a seeded generator makes the same data every time, so a failing screen test can be repeated.
// Without the variable the sample data is exactly what it was.

/** A small seeded generator (mulberry32): the same seed gives the same numbers. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['quiet', 'neon', 'river', 'paper', 'midnight', 'copper', 'echo', 'glass', 'harbor', 'velvet', 'static', 'ember', 'orbit', 'lantern', 'meadow', 'signal'];
const GENERATORS = ['ace-step', 'heartmula', 'diffrhythm2'];
const CLIENTS = [null, 'dashboard-full', 'dashboard-full'];
const pad = (i) => String(i).padStart(3, '0');

/**
 * Adds the generated data to `db` (an object the caller owns) and answers how many it added of each. What is already there is
 * left as it is: a persisted mock that was started with the same `n` before gets nothing twice.
 */
export function seedBulk(db, n, now = Date.now()) {
  if (!Number.isInteger(n) || n < 1) return { projects: 0, songs: 0, drafts: 0 };
  if (db.bulk?.n >= n) return { projects: 0, songs: 0, drafts: 0 };
  const rand = seeded(20261119);
  const word = () => WORDS[Math.floor(rand() * WORDS.length)];
  const day = 86_400_000;
  const added = { projects: 0, songs: 0, drafts: 0 };
  db.bulk = { n, songs: [], ...(db.bulk ?? {}) };
  db.bulk.n = n;

  for (let i = 1; i <= n; i++) {
    const id = `bulk-${pad(i)}`;
    if (db.projects[id] !== undefined) continue;
    const client = CLIENTS[i % CLIENTS.length];
    const scenes = 1 + (i % 4);
    db.projects[id] = `project: ${word()} ${word()} ${i}\n${client ? `client: ${client}\n` : ''}output:\n  mode: video\n  file: out/${id}.mp4\nscenes:\n${Array.from({ length: scenes }, (_, k) => `  - id: scene${k + 1}\n    prompt: ${word()} ${word()}\n    tts_text: ${word()}.\n`).join('')}`;
    db.updated ??= {};
    db.updated[id] = new Date(now - i * day).toISOString();
    added.projects++;
  }

  const songKeys = new Set(db.bulk.songs.map((s) => s.key));
  for (let i = 1; i <= n; i++) {
    const project = `bulk-song-${pad(i)}`;
    const seed = 100 + i;
    const key = `${project}/track-1/${seed}`;
    if (songKeys.has(key)) continue;
    const instrumental = i % 5 === 0;
    db.bulk.songs.push({
      key,
      project,
      track_id: 'track-1',
      variant: 0,
      seed,
      title: `${word()} ${word()}`.replace(/^./, (c) => c.toUpperCase()),
      caption: `${word()} pop, ${word()}, ${instrumental ? 'instrumental' : 'female vocal'}`,
      lyrics: instrumental ? '' : `[Verse]\n${word()} in the ${word()}\n[Chorus]\n${word()} ${word()}`,
      instrumental,
      bpm: 70 + Math.floor(rand() * 90),
      keyscale: ['C major', 'A minor', 'D major', 'E minor'][i % 4],
      vocal_language: 'en',
      audio_seconds: 30 + Math.floor(rand() * 150),
      file: `out/${project}/track-1.mp3`,
      favorite: i % 7 === 0,
      generator: GENERATORS[i % GENERATORS.length],
      generated_at: new Date(now - i * day).toISOString(),
    });
    added.songs++;
  }

  // Part drafts: a third failed, and every fourth is a scene written for a piece (`scene-…`), as on the real server.
  const piece = Object.keys(db.pieces ?? {})[0] ?? 'bulk-piece';
  const tag = piece.replace(/[^a-z0-9]/gi, '').slice(-8);
  for (let i = 1; i <= n; i++) {
    const id = `draft-bulk-${pad(i)}`;
    if (db.drafts[id]) continue;
    const scene = i % 4 === 0;
    const failed = i % 3 === 0;
    const name = scene ? `scene-${tag}-${i}` : `${word()}-${word()}-${i}`;
    const request = scene ? `Scene of p${i}: ${word()} ${word()}` : `A part that shows ${word()} and ${word()}`;
    db.drafts[id] = {
      id,
      request,
      with_picture: false,
      created_at: new Date(now - 3_600_000 - i * 600_000).toISOString(),
      attempts: failed ? 3 : 1,
      kind: failed ? 'fail' : 'ok',
      name,
      manifest: JSON.stringify({ name, description: request, params: [] }, null, 2),
      fragment: `<div class="${name}">${request}</div>`,
      ...(scene ? { scene: { piece, script_piece: `p${i}` }, brief: '' } : {}),
    };
    added.drafts++;
  }
  return added;
}
