import type { SongSlice } from './song-slice';

/** What the sandboxed frame is allowed: inline styles and scripts, data images, fonts and media, and nothing from the network. */
export const PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:";

/**
 * The virtual clock the renderer injects before the page's own scripts: `performance.now`, `Date.now` and `requestAnimationFrame` report and
 * run on a time only `__motionSeek(t)` moves, animations are paused at that time, and the page's own `__seek(t)` draws. The twin of the
 * server's `shim`. (The server adds a script for the tracks of a motion graphic's timeline; a page of a piece has none, so it is left out.)
 */
export const SHIM = (duration: number): string => `(function(){
  var realRaf = window.requestAnimationFrame.bind(window), vt = 0, rafs = [], rafId = 0, t0 = Date.now(), realNow = Date.now.bind(Date);
  window.__motionDuration = ${duration};
  performance.now = function(){ return vt; };
  Date.now = function(){ return t0 + vt; };
  window.requestAnimationFrame = function(cb){ rafs.push([++rafId, cb]); return rafId; };
  window.cancelAnimationFrame = function(id){ rafs = rafs.filter(function(r){ return r[0] !== id; }); };
  window.__motionSeek = function(t){
    vt = t * 1000;
    try { if (window.gsap && gsap.globalTimeline) { gsap.ticker && gsap.ticker.lagSmoothing && gsap.ticker.lagSmoothing(0); gsap.globalTimeline.pause(); gsap.globalTimeline.time(t, false); } } catch(e){}
    document.getAnimations().forEach(function(a){ try { a.pause(); a.currentTime = vt; } catch(e){} });
    if (typeof window.__seek === 'function') window.__seek(t);
    var q = rafs; rafs = [];
    q.forEach(function(r){ try { r[1](vt); } catch(e){ setTimeout(function(){ throw e; }); } });
    return new Promise(function(res){ realRaf(function(){ realRaf(function(){ res(true); }); }); });
  };
})();`;

/**
 * The beat clock: before the page's `__seek`, `window.__beat` holds `{number, position, section, sectionIndex, bpm, period, time}`. `number` is
 * `-1` before the first beat and otherwise the index of the last beat plus the slice's `beat_base`; `position` is in `[0, 1)` from the real
 * distance to the next beat; `section` is the tag of the section that holds `t`. The twin of the server's `beatScript`.
 */
export const BEAT_SCRIPT = `(function(){
  var song = window.__motionSong || {}, beats = song.beats || [], secs = song.sections || [], bpm = song.bpm || 0;
  var basePeriod = bpm > 0 ? 60 / bpm : (beats.length > 1 ? beats[1] - beats[0] : 0);
  function compute(t){
    var lo = 0, hi = beats.length - 1, n = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (beats[mid] <= t + 1e-9) { n = mid; lo = mid + 1; } else hi = mid - 1; }
    var period = basePeriod;
    if (n >= 0 && n + 1 < beats.length) period = beats[n + 1] - beats[n];
    else if (n > 0) period = beats[n] - beats[n - 1];
    var pos = 0;
    if (period > 0) {
      var from = n >= 0 ? beats[n] : (beats.length ? beats[0] - period : 0);
      pos = Math.min(0.999999, Math.max(0, (t - from) / period));
    }
    var si = -1, tag = '';
    for (var i = 0; i < secs.length; i++) { if (t >= secs[i].start - 1e-9 && (t < secs[i].end - 1e-9 || i === secs.length - 1)) { si = i; tag = secs[i].tag; break; } }
    return {number: n < 0 ? n : n + (song.beat_base || 0), position: pos, section: tag, sectionIndex: si, bpm: bpm, period: period, time: t};
  }
  window.__beat = compute(0);
  var base = window.__motionSeek;
  window.__motionSeek = function(t){ try { window.__beat = compute(t); } catch (e) { setTimeout(function(){ throw e; }); } return base(t); };
})();`;

/** Lets the editor move the page's clock: it listens for `{type:"seek", t}` messages from the page that embeds it. */
export const SEEK_LISTENER = 'window.addEventListener("message",function(e){var d=e.data;if(d&&d.type==="seek"&&typeof d.t==="number"&&window.__motionSeek){window.__motionSeek(d.t);}});';

/** The whole script injected at the start of the page: clock, song map, beat clock and the listener. */
export const injectedScript = (duration: number, slice: SongSlice): string => `${SHIM(duration)}window.__motionSong = ${JSON.stringify(slice)};\n${BEAT_SCRIPT}${SEEK_LISTENER}`;

const HEAD_OPEN = /<head[^>]*>/i;
const HTML_OPEN = /<html[^>]*>/i;

/**
 * The page prepared for the editor's sandboxed frame: the content security policy and the same virtual-clock and beat-clock script the
 * renderer injects come before the page's own scripts, so a page previewed at a given second shows what the video will show. The twin of
 * the server's `PreviewHTMLSong`.
 */
export function wrapForPreview(html: string, duration: number, slice: SongSlice): string {
  const inject = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><script>${injectedScript(duration, slice).replace(/<\/script/g, '<\\/script')}</script>`;
  const head = HEAD_OPEN.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + inject + html.slice(head.index + head[0].length);
  const root = HTML_OPEN.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + `<head>${inject}</head>` + html.slice(root.index + root[0].length);
  return `<!doctype html><html><head>${inject}</head><body>${html}</body></html>`;
}
