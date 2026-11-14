import { injectedScript, wrapForPreview, PREVIEW_CSP } from './preview-wrapper';
import { sliceSongMap } from './song-slice';
import { SONG_MAP } from './test-data';

/** Runs the injected script against a fake window, as the frame would, and gives back what the page would see. */
function frame(start: number, end: number) {
  const slice = sliceSongMap({ ...SONG_MAP, beats: [0.5, 1.0, 1.5, 2, 3] }, start, end);
  const calls: number[] = [];
  const listeners: Record<string, (e: unknown) => void> = {};
  const win: Record<string, unknown> = {
    requestAnimationFrame: (cb: () => void) => { cb(); return 1; },
    addEventListener: (type: string, fn: (e: unknown) => void) => { listeners[type] = fn; },
    __seek: (t: number) => calls.push(t),
  };
  const run = new Function('window', 'performance', 'Date', 'document', 'setTimeout', 'gsap', injectedScript(end - start, slice));
  run(win, { now: () => 0 }, { now: () => 0 }, { getAnimations: () => [] }, setTimeout, undefined);
  const seek = (t: number) => (win['__motionSeek'] as (t: number) => unknown)(t);
  return { win, calls, seek, post: (data: unknown) => listeners['message']({ data }), beat: () => win['__beat'] as Record<string, number | string> };
}

describe('the injected beat clock', () => {
  it('gives the number of the same beat the whole map gives, and the position inside it (the scenario of the spec)', () => {
    const f = frame(1.2, 3);
    f.seek(0.5); // song time 1.7
    expect(f.beat()['number']).toBe(2);
    expect(f.beat()['position']).toBeCloseTo(0.4, 6);
    expect(f.beat()['period']).toBeCloseTo(0.5, 6);
  });

  it('is -1 before the first beat and never reaches position 1', () => {
    const f = frame(0, 3);
    f.seek(0.2);
    expect(f.beat()['number']).toBe(-1);
    expect(f.beat()['position']).toBeGreaterThanOrEqual(0);
    f.seek(0.9999999);
    expect(f.beat()['position']).toBeLessThan(1);
  });

  it('says the section that holds the time, the last one at the end, and the bpm', () => {
    const f = frame(0, 20);
    f.seek(3);
    expect(f.beat()).toMatchObject({ section: 'Verse', sectionIndex: 0, bpm: 120, time: 3 });
    f.seek(20);
    expect(f.beat()).toMatchObject({ section: 'Chorus', sectionIndex: 1 });
  });

  it('runs the beat clock before the page draws, and answers the seek message', () => {
    const f = frame(0, 20);
    f.post({ type: 'seek', t: 2 });
    expect(f.calls).toEqual([2]);
    expect(f.beat()['time']).toBe(2);
    f.post({ type: 'other', t: 5 });
    f.post({ type: 'seek', t: 'x' });
    expect(f.calls).toEqual([2]);
  });
});

describe('wrapForPreview', () => {
  const slice = sliceSongMap(SONG_MAP, 0, 4);

  it('puts the policy and the script right after <head> of a page', () => {
    const out = wrapForPreview('<!doctype html><html><head><meta charset="utf-8"></head><body>x</body></html>', 4, slice);
    expect(out.startsWith(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><script>`)).toBe(true);
    expect(out).toContain('window.__motionSong = {"version":1');
    expect(out.indexOf('</script><meta charset')).toBeGreaterThan(0);
  });

  it('adds a head when there is only <html>, and a whole page when there is neither', () => {
    expect(wrapForPreview('<html><body>x</body></html>', 4, slice)).toMatch(/^<html><head><meta http-equiv/);
    expect(wrapForPreview('<p>x</p>', 4, slice)).toMatch(/^<!doctype html><html><head><meta[^]*<\/head><body><p>x<\/p><\/body><\/html>$/);
  });

  it('keeps the song map from closing its script', () => {
    const odd = { ...slice, words: [{ text: '</script><b>', start: 0, end: 1, line: 0 }] };
    const out = wrapForPreview('<html><head></head></html>', 4, odd);
    expect(out.match(/<\/script>/g)).toHaveLength(1);
  });
});
