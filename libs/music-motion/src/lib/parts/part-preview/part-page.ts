import { PREVIEW_CSP, fillSlots } from '@lab/motion-editor';

/** Why the text of a part cannot be played, in words that say what to fix. */
export class PartPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartPageError';
  }
}

/** The look the part is drawn in: the CSS variables a fragment reads, from the dashboard's own tokens. */
export interface PartLook {
  readonly bg: string;
  readonly fg: string;
  readonly accent: string;
  readonly display: string;
  readonly body: string;
}

/** The preview is a loop of this many seconds at this tempo: it is not a song, only enough clock and beat for a part to move. */
export const PREVIEW_SECONDS = 8;
export const PREVIEW_BPM = 120;

/** What the manifest says each parameter starts as, as the part reads it from `window.__params`. */
export function paramsOf(manifest: { params?: unknown }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(manifest.params)) return out;
  for (const raw of manifest.params as unknown[]) {
    const p = raw as { name?: unknown; type?: unknown; default?: unknown; min?: unknown };
    if (typeof p?.name !== 'string') continue;
    const value = p.default;
    if (p.type === 'int') out[p.name] = Math.trunc(Number(value ?? p.min ?? 0)) || 0;
    else if (p.type === 'number') out[p.name] = Number(value ?? p.min ?? 0) || 0;
    else if (p.type === 'bool') out[p.name] = value === true || value === 'true';
    else out[p.name] = value === undefined || value === null ? '' : String(value);
  }
  return out;
}

/** Keeps JSON from closing the script it sits in. */
const jsonSafe = (v: unknown): string => JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * The clock of the preview, run inside the frame: `window.__partSeek(t, beat)` of the part is called on every animation frame with `t` looping over
 * `PREVIEW_SECONDS` and a steady beat. `pause` and `play` come from the page as messages; an error of the part goes back to it.
 */
const DRIVER = (seconds: number, bpm: number): string => `(function(){
  var DURATION = ${seconds}, PERIOD = 60 / ${bpm}, playing = true, t = 0, last = null, reported = false;
  function tell(message){ if (reported) return; reported = true; parent.postMessage({ type: 'part-error', message: String(message) }, '*'); }
  window.addEventListener('error', function(e){ tell(e.message || 'the script raised an error'); });
  window.addEventListener('message', function(e){
    if (!e.data) return;
    if (e.data.type === 'pause') playing = false;
    if (e.data.type === 'play') { playing = true; last = null; }
  });
  function beat(time){
    var n = Math.floor(time / PERIOD);
    return { number: n, position: (time - n * PERIOD) / PERIOD, section: '', sectionIndex: -1, bpm: ${bpm}, period: PERIOD, time: time };
  }
  function frame(now){
    if (playing) {
      if (last !== null) t = (t + (now - last) / 1000) % DURATION;
      last = now;
    }
    if (typeof window.__partSeek === 'function') {
      try { window.__partSeek(t, beat(t)); } catch (err) { tell(err && err.message ? err.message : err); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();`;

/**
 * A complete document that plays a part from its two texts: the manifest's parameters at their defaults, the fragment with its slots filled, the
 * look of the dashboard and the loop of the preview. Nothing is loaded from outside. It throws `PartPageError` when the text cannot be played.
 */
export function buildPartPage(manifestText: string, fragment: string, look: PartLook): string {
  let manifest: { name?: unknown; params?: unknown };
  try {
    manifest = JSON.parse(manifestText) as typeof manifest;
  } catch (e) {
    throw new PartPageError(`manifest.json: it is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new PartPageError('manifest.json: it must be a JSON object');
  if (!fragment.trim()) throw new PartPageError('part.html: it is empty');
  const name = typeof manifest.name === 'string' ? manifest.name : 'part';
  const params = paramsOf(manifest);
  let filled: string;
  try {
    filled = fillSlots(fragment, params, name);
  } catch (e) {
    throw new PartPageError(e instanceof Error ? e.message : String(e));
  }
  const vars = `:root{--bg:${look.bg};--fg:${look.fg};--accent:${look.accent};--display:${look.display};--body:${look.body}}`;
  const css = 'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--body)}#stage{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}';
  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>${vars}${css}</style></head><body>` +
    `<script>window.__params=${jsonSafe(params)};</script><div id="stage">${filled}</div><script>${DRIVER(PREVIEW_SECONDS, PREVIEW_BPM)}</script></body></html>`
  );
}
