// The stored page of a motion-graphic scene (or of its overlay), simulated: `GET`, `PUT` and `POST .../generate` of
// `/api/projects/{id}/scenes/{scene}/motion`, and `POST .../motion/revise`, which changes only the page's timeline block from a
// request in words. The pages are kept in memory (they are a sample, not project data: a restart forgets them).
// The refusals are the contract's: `400` for an empty or too long instruction, `404` for a project or a page that is not there,
// `422` for a page without a timeline block or for a request that gives no working timeline (`[fail]` in the instruction), and a
// refused request leaves the stored page as it was.
const err = (status, code, message) => [status, { error: { code, message } }];

export const MAX_INSTRUCTION = 1000;
const STEP = 0.05;
const DEFAULT_SECONDS = 3;
const BLOCK = /(<script\b[^>]*\bid\s*=\s*["']motion-timeline["'][^>]*>)([\s\S]*?)(<\/script\s*>)/i;

/** The page the mock writes when it is asked for one: a title and a subtitle that come in, with a timeline block. */
export function samplePage(seconds = DEFAULT_SECONDS) {
  const tracks = [
    { id: 'title-in', label: 'Title', target: '.title', start: 0, duration: 0.8, ease: 'out', from: { opacity: 0, y: 40 }, to: { opacity: 1, y: 0 } },
    { id: 'lines-in', label: 'Lines', target: '.line', start: 0.4, duration: 0.8, ease: 'out', stagger: 0.2, from: { opacity: 0, x: -30 }, to: { opacity: 1, x: 0 } },
  ];
  const block = '\n{"version":1,"tracks":[\n' + tracks.map((t) => JSON.stringify(t)).join(',\n') + '\n]}\n';
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>Mock motion page</title>',
    '<style>body{margin:0;display:grid;place-items:center;height:100vh;background:#101418;color:#f2f2f2;font:600 48px system-ui}.line{font-size:24px;opacity:.8}</style>',
    '</head><body data-seconds="' + seconds + '"><div><div class="title">Hello</div><div class="line">First line</div><div class="line">Second line</div></div>',
    '<script type="application/json" id="motion-timeline">' + block + '</script>',
    '</body></html>',
    '',
  ].join('\n');
}

const snap = (s) => Math.round(Math.round(s / STEP) * STEP * 100) / 100;

/** The timeline of a page, or null when the block is absent or is not a version 1 timeline. */
function readBlock(html) {
  const m = BLOCK.exec(html);
  if (!m) return null;
  try {
    const data = JSON.parse(m[2]);
    return data?.version === 1 && Array.isArray(data.tracks) ? data : null;
  } catch {
    return null;
  }
}

/** The page with only its timeline block replaced: every other byte stays. */
export function writeBlock(html, timeline) {
  const body = ('\n{"version":1,"tracks":[\n' + timeline.tracks.map((t) => JSON.stringify(t)).join(',\n') + '\n]}\n').replace(/</g, '\\u003c');
  return html.replace(BLOCK, (_m, open, _old, close) => open + body + close);
}

/** What a request in words does to a timeline: slower, faster, a bounce on the title, a stagger; anything else delays the entrances a little. */
export function retime(timeline, instruction, seconds) {
  const text = instruction.toLowerCase();
  const slower = /slow|lent|despacio/.test(text);
  const faster = /fast|snap|quick|r[aá]pid/.test(text);
  const bounce = /bounce|rebot/.test(text);
  const stagger = /stagger|escalon/.test(text);
  const tracks = timeline.tracks.map((t) => {
    let { start, duration } = t;
    const out = { ...t };
    if (slower) duration *= 1.5;
    else if (faster) duration *= 0.7;
    if (bounce && /title/i.test(`${t.id} ${t.label ?? ''} ${t.target}`)) out.ease = 'out-back';
    if (stagger) out.stagger = t.stagger ? Math.round((t.stagger + 0.1) * 100) / 100 : 0.15;
    if (!slower && !faster && !bounce && !stagger) start += 0.1;
    duration = Math.max(STEP, snap(duration));
    start = Math.min(Math.max(snap(start), 0), Math.max(0, snap(seconds - duration)));
    return { ...out, start, duration };
  });
  return { ...timeline, tracks };
}

export function motionPageHandlers({ db }) {
  /** @type {Map<string, any>} */
  const pages = new Map();
  const key = (project, scene, overlay) => `${project}\n${scene}\n${overlay ? 'overlay' : 'graphic'}`;
  const view = (p) => ({ scene: p.scene, overlay: p.overlay, exists: true, html: p.html, preview: p.html, duration: p.duration, origin: p.origin, summary: p.summary, model: p.model, browser: 'mock-chrome' });
  const missingProject = (id) => (db.projects[id] ? null : err(404, 'not_found', `project "${id}" not found`));

  return {
    'GET /api/projects/{id}/scenes/{scene}/motion': ({ params, query }) => {
      const no = missingProject(params.id);
      if (no) return no;
      const overlay = query.get('overlay') === '1';
      const page = pages.get(key(params.id, params.scene, overlay));
      if (!page) return [200, { scene: params.scene, overlay, exists: false, html: '', duration: Number(query.get('duration')) || 0 }];
      return [200, view(page)];
    },
    'PUT /api/projects/{id}/scenes/{scene}/motion': ({ params, body }) => {
      const no = missingProject(params.id);
      if (no) return no;
      if (typeof body?.html !== 'string' || !body.html.trim()) return err(400, 'invalid_request', 'html: the page cannot be empty');
      const overlay = body.overlay === true;
      const previous = pages.get(key(params.id, params.scene, overlay));
      const page = { scene: params.scene, overlay, html: body.html, duration: previous?.duration ?? DEFAULT_SECONDS, origin: 'supplied', summary: previous?.summary ?? '', model: previous?.model };
      pages.set(key(params.id, params.scene, overlay), page);
      return [200, view(page)];
    },
    'POST /api/projects/{id}/scenes/{scene}/motion/generate': ({ params, body }) => {
      const no = missingProject(params.id);
      if (no) return no;
      const overlay = body?.overlay === true;
      const page = { scene: params.scene, overlay, html: samplePage(), duration: DEFAULT_SECONDS, origin: 'generated', summary: 'A title and two lines that come in (simulated).', model: 'mock-model' };
      pages.set(key(params.id, params.scene, overlay), page);
      return [200, view(page)];
    },
    'POST /api/projects/{id}/scenes/{scene}/motion/revise': ({ params, body }) => {
      const no = missingProject(params.id);
      if (no) return no;
      const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : '';
      if (!instruction) return err(400, 'invalid_request', 'instruction: say how the motion should change');
      if (instruction.length > MAX_INSTRUCTION) return err(400, 'invalid_request', `instruction: at most ${MAX_INSTRUCTION} characters`);
      const overlay = body.overlay === true;
      const page = pages.get(key(params.id, params.scene, overlay));
      if (!page) return err(404, 'not_found', `scene "${params.scene}" has no stored page yet: write it first`);
      const timeline = readBlock(page.html);
      if (!timeline) return err(422, 'validation_failed', 'the page has no timeline block (it moves with its own script): write another page instead');
      if (instruction.includes('[fail]')) return err(422, 'validation_failed', 'no timeline that works after 3 attempts: track "title-in" ends after the clip (simulated)');
      const revised = { ...page, html: writeBlock(page.html, retime(timeline, instruction, page.duration)), origin: page.origin === 'generated' ? 'edited' : page.origin };
      pages.set(key(params.id, params.scene, overlay), revised);
      return [200, { ...view(revised), revised: { provider: 'mock', model: 'mock-model' } }];
    },
  };
}
