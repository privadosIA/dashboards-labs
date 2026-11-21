import { Timeline, TimelineHistory, clampValue, hasTimelineBlock, parseTimeline, placeTrack, snap, trackProps, writeTimeline } from './motion-timeline';

const PAGE = `<!doctype html><html><head><style>h1{color:red}</style></head><body><h1>Hola</h1>
<script type="application/json" id="motion-timeline">{"version":1,"tracks":[{"id":"h","label":"Título","target":"h1","start":0.2,"duration":1,"ease":"out","from":{"opacity":0,"y":30},"to":{"opacity":1,"y":0}}]}</script>
<script>window.__motionDuration = 4;</script></body></html>`;

describe('motion-timeline', () => {
  it('reads the block of a page and says when there is none', () => {
    const tl = parseTimeline(PAGE)!;
    expect(tl.tracks).toHaveLength(1);
    expect(tl.tracks[0]).toMatchObject({ id: 'h', target: 'h1', start: 0.2, duration: 1, ease: 'out' });
    expect(parseTimeline('<html><body>x</body></html>')).toBeNull();
    expect(hasTimelineBlock(PAGE)).toBe(true);
    expect(hasTimelineBlock('<html></html>')).toBe(false);
  });

  it('does not accept a block it cannot edit', () => {
    expect(parseTimeline('<script type="application/json" id="motion-timeline">{"version":1,"tracks":[</script>')).toBeNull();
    expect(parseTimeline('<script type="application/json" id="motion-timeline">{"version":2,"tracks":[]}</script>')).toBeNull();
    expect(hasTimelineBlock('<script type="application/json" id="motion-timeline">{"version":1,"tracks":[</script>')).toBe(true);
  });

  it('writes the block back and leaves the rest of the page byte for byte', () => {
    const tl = parseTimeline(PAGE)!;
    tl.tracks[0].start = 0.75;
    const out = writeTimeline(PAGE, tl);
    expect(parseTimeline(out)!.tracks[0].start).toBe(0.75);
    const strip = (s: string) => s.replace(/(<script type="application\/json" id="motion-timeline">)[\s\S]*?(<\/script>)/, '$1$2');
    expect(strip(out)).toBe(strip(PAGE));
  });

  it('writes a "<" inside a string without closing the script', () => {
    const tl = parseTimeline(PAGE)!;
    tl.tracks[0].label = 'a </script> b';
    const out = writeTimeline(PAGE, tl);
    expect(out.match(/<\/script>/gi)).toHaveLength(2); // the block's and the page's own, none more
    expect(parseTimeline(out)!.tracks[0].label).toBe('a </script> b');
  });

  it('rounds times to the step and keeps a track inside the clip', () => {
    expect(snap(0.12)).toBe(0.1);
    expect(snap(0.13)).toBe(0.15);
    const t = parseTimeline(PAGE)!.tracks[0];
    expect(placeTrack(t, -1, 1, 4)).toMatchObject({ start: 0, duration: 1 });
    expect(placeTrack(t, 3.8, 1, 4)).toMatchObject({ start: 3, duration: 1 });
    expect(placeTrack(t, 0, 99, 4)).toMatchObject({ start: 0, duration: 4 });
    expect(placeTrack(t, 0, 0, 4).duration).toBe(0.05);
  });

  it('keeps values inside their ranges and lists the properties of a track', () => {
    expect(clampValue('opacity', 3)).toBe(1);
    expect(clampValue('opacity', -3)).toBe(0);
    expect(clampValue('y', -50)).toBe(-50);
    expect(trackProps(parseTimeline(PAGE)!.tracks[0])).toEqual(['opacity', 'y']);
  });

  it('undoes and redoes whole edits', () => {
    const h = new TimelineHistory();
    const a: Timeline = { version: 1, tracks: [{ id: 'a', target: 'a', start: 0, duration: 1, from: {}, to: {} }] };
    const b = { ...a, tracks: [{ ...a.tracks[0], start: 1 }] };
    expect(h.canUndo).toBe(false);
    h.push(a); // about to become b
    expect(h.canUndo).toBe(true);
    const back = h.undo(b)!;
    expect(back.tracks[0].start).toBe(0);
    expect(h.canRedo).toBe(true);
    expect(h.redo(back)!.tracks[0].start).toBe(1);
    h.push(a);
    expect(h.canRedo).toBe(false); // a new edit drops the redo
  });
});
