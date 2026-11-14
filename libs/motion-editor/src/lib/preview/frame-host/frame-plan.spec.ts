import { PRELOAD_SECONDS, planFrames, sceneAt, type PlannedPage, type Slots } from './frame-plan';

const pages: PlannedPage[] = [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 10, end: 20 }, { id: 'c', start: 20, end: 30 }];
const none: Slots = [null, null];

describe('sceneAt', () => {
  it('finds the scene that holds the time, taking [start, end)', () => {
    expect(sceneAt(pages, 0)).toBe(0);
    expect(sceneAt(pages, 9.999)).toBe(0);
    expect(sceneAt(pages, 10)).toBe(1);
    expect(sceneAt(pages, 25)).toBe(2);
  });

  it('holds the end in the last scene, and has none for no scenes', () => {
    expect(sceneAt(pages, 30)).toBe(2);
    expect(sceneAt(pages, 99)).toBe(2);
    expect(sceneAt([], 1)).toBe(-1);
  });
});

describe('planFrames', () => {
  it('gives the time in the scene\'s own seconds (scene time, not song time)', () => {
    const p = planFrames(pages, 14.5, none);
    expect(p.current).toBe(1);
    expect(p.local).toBe(4.5);
  });

  it('shows the first scene alone while the cut is far', () => {
    const p = planFrames(pages, 3, none);
    expect(p).toMatchObject({ current: 0, preload: null, slots: ['a', null], visible: 0 });
  });

  it('loads the next scene in the other frame within the preload distance', () => {
    const p = planFrames(pages, 10 - PRELOAD_SECONDS, ['a', null]);
    expect(p).toMatchObject({ current: 0, preload: 1, slots: ['a', 'b'], visible: 0 });
  });

  it('becomes visible on the first frame of the next scene without loading anything new, and reuses the freed frame for the one after', () => {
    const loaded: Slots = ['a', 'b'];
    const atCut = planFrames(pages, 10, loaded);
    expect(atCut).toMatchObject({ current: 1, visible: 1, preload: null, slots: ['a', 'b'] });
    // inside the new scene, within reach of the next cut: the first frame is free for 'c'
    const later = planFrames(pages, 18.5, atCut.slots);
    expect(later).toMatchObject({ current: 1, visible: 1, preload: 2, slots: ['c', 'b'] });
    const cut2 = planFrames(pages, 20, later.slots);
    expect(cut2).toMatchObject({ current: 2, visible: 0, slots: ['c', 'b'] });
  });

  it('puts a scene reached by a jump in a frame without disturbing the preloaded one', () => {
    const p = planFrames(pages, 28, ['a', 'b']);
    expect(p.current).toBe(2);
    expect([p.slots[p.visible]]).toEqual(['c']);
    expect(p.preload).toBeNull();
  });

  it('keeps a scene in the frame that holds it when the playhead goes back', () => {
    const p = planFrames(pages, 4, ['b', 'a']);
    expect(p).toMatchObject({ current: 0, visible: 1 });
    expect(p.slots[1]).toBe('a');
  });

  it('has nothing to show for no scenes', () => {
    expect(planFrames([], 3, ['a', 'b'])).toMatchObject({ current: -1, slots: [null, null] });
  });
});
