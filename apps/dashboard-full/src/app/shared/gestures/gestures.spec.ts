import { clampPan, clampScale, GestureRecognizer, GestureHandlers, pullDistance, swipeDirection } from './gestures';

type Ev = { pointerId: number; clientX: number; clientY: number; timeStamp: number };
const ev = (id: number, x: number, y: number, t = 0): Ev => ({ pointerId: id, clientX: x, clientY: y, timeStamp: t });

/** A recognizer on a 400 px wide screen whose timers the test runs by hand. */
function setup(handlers: GestureHandlers, panEnabled?: () => boolean) {
  let timer: (() => void) | null = null;
  const g = new GestureRecognizer(handlers, {
    edge: 20,
    viewportWidth: () => 400,
    panEnabled,
    setTimer: (fn) => {
      timer = fn;
      return 1;
    },
    clearTimer: () => {
      timer = null;
    },
  });
  return { g, fire: () => timer?.(), pending: () => timer !== null };
}

describe('swipeDirection', () => {
  it('needs a long enough drag along one axis', () => {
    expect(swipeDirection(-80, 5, 50)).toBe('left');
    expect(swipeDirection(80, -5, 50)).toBe('right');
    expect(swipeDirection(3, 90, 50)).toBe('down');
    expect(swipeDirection(0, -90, 50)).toBe('up');
    expect(swipeDirection(30, 10, 50)).toBeNull();
    expect(swipeDirection(60, 55, 50)).toBeNull(); // diagonal: neither
  });
});

describe('zoom and pull helpers', () => {
  it('keeps the scale between fitted and the limit', () => {
    expect(clampScale(0.5)).toBe(1);
    expect(clampScale(2.5)).toBe(2.5);
    expect(clampScale(9)).toBe(4);
  });

  it('keeps a zoomed image from leaving its frame', () => {
    expect(clampPan(500, 400, 2)).toBe(200);
    expect(clampPan(-500, 400, 2)).toBe(-200);
    expect(clampPan(50, 400, 1)).toBe(0);
  });

  it('resists a pull the further it goes and ignores an upward one', () => {
    expect(pullDistance(-10)).toBe(0);
    expect(pullDistance(60)).toBeGreaterThan(0);
    expect(pullDistance(60)).toBeLessThan(60);
    expect(pullDistance(1000)).toBeLessThan(120);
  });
});

describe('GestureRecognizer', () => {
  it('reports a swipe to the left', () => {
    const swipe = vi.fn();
    const { g } = setup({ swipe });
    g.down(ev(1, 300, 200, 0));
    g.move(ev(1, 200, 205, 50));
    g.up(ev(1, 150, 205, 100));
    expect(swipe).toHaveBeenCalledWith('left');
  });

  it('reports a swipe down', () => {
    const swipe = vi.fn();
    const { g } = setup({ swipe });
    g.down(ev(1, 200, 100));
    g.up(ev(1, 205, 260, 100));
    expect(swipe).toHaveBeenCalledWith('down');
  });

  it('does not take a short drag for a swipe', () => {
    const swipe = vi.fn();
    const { g } = setup({ swipe });
    g.down(ev(1, 200, 100));
    g.up(ev(1, 230, 100, 80));
    expect(swipe).not.toHaveBeenCalled();
  });

  it('leaves the edges of the screen to the browser', () => {
    const swipe = vi.fn();
    const { g } = setup({ swipe });
    g.down(ev(1, 5, 200));
    g.up(ev(1, 200, 200, 100));
    g.down(ev(2, 395, 200));
    g.up(ev(2, 100, 200, 100));
    expect(swipe).not.toHaveBeenCalled();
  });

  it('reports a double tap, only when the two taps are close in time and place', () => {
    const doubleTap = vi.fn();
    const { g } = setup({ doubleTap });
    g.down(ev(1, 200, 200, 0));
    g.up(ev(1, 200, 200, 40));
    g.down(ev(1, 203, 201, 150));
    g.up(ev(1, 203, 201, 190));
    expect(doubleTap).toHaveBeenCalledTimes(1);
    g.down(ev(1, 200, 200, 1000));
    g.up(ev(1, 200, 200, 1040));
    g.down(ev(1, 200, 200, 1800));
    g.up(ev(1, 200, 200, 1840));
    expect(doubleTap).toHaveBeenCalledTimes(1); // too slow
  });

  it('fires a long press when the finger stays, and then no swipe or tap', () => {
    const longPress = vi.fn();
    const swipe = vi.fn();
    const { g, fire } = setup({ longPress, swipe });
    g.down(ev(1, 200, 200));
    fire();
    expect(longPress).toHaveBeenCalledWith(200, 200);
    g.up(ev(1, 400 - 100, 200, 900));
    expect(swipe).not.toHaveBeenCalled();
  });

  it('cancels the long press when the finger moves away (the page is scrolling)', () => {
    const longPress = vi.fn();
    const { g, fire, pending } = setup({ longPress });
    g.down(ev(1, 200, 200));
    g.move(ev(1, 200, 240, 50));
    expect(pending()).toBe(false);
    fire();
    expect(longPress).not.toHaveBeenCalled();
  });

  it('cancels the long press when the finger lifts early', () => {
    const longPress = vi.fn();
    const { g, fire } = setup({ longPress });
    g.down(ev(1, 200, 200));
    g.up(ev(1, 200, 200, 100));
    fire();
    expect(longPress).not.toHaveBeenCalled();
  });

  it('pinches: the scale is the distance between the fingers over the one they started at', () => {
    const pinch = vi.fn();
    const pinchEnd = vi.fn();
    const swipe = vi.fn();
    const { g } = setup({ pinch, pinchEnd, swipe });
    g.down(ev(1, 150, 200));
    g.down(ev(2, 250, 200));
    g.move(ev(2, 350, 200));
    expect(pinch).toHaveBeenLastCalledWith(2, 250, 200);
    g.up(ev(2, 350, 200));
    expect(pinchEnd).toHaveBeenCalledTimes(1);
    g.up(ev(1, 150, 200, 900));
    expect(swipe).not.toHaveBeenCalled(); // lifting after a pinch is not a swipe
  });

  it('a second finger cancels a pending long press', () => {
    const longPress = vi.fn();
    const { g, fire } = setup({ longPress });
    g.down(ev(1, 150, 200));
    g.down(ev(2, 250, 200));
    fire();
    expect(longPress).not.toHaveBeenCalled();
  });

  it('pans with one finger only when it is allowed (a zoomed picture)', () => {
    const pan = vi.fn();
    const swipe = vi.fn();
    let zoomed = false;
    const { g } = setup({ pan, swipe }, () => zoomed);
    g.down(ev(1, 200, 200));
    g.move(ev(1, 230, 210, 20));
    expect(pan).not.toHaveBeenCalled();
    g.up(ev(1, 120, 210, 80));
    expect(swipe).toHaveBeenCalledWith('left');

    zoomed = true;
    g.down(ev(1, 200, 200));
    g.move(ev(1, 230, 210, 20));
    g.move(ev(1, 250, 220, 40));
    expect(pan).toHaveBeenNthCalledWith(1, 30, 10);
    expect(pan).toHaveBeenNthCalledWith(2, 20, 10);
    g.up(ev(1, 120, 220, 80));
    expect(swipe).toHaveBeenCalledTimes(1); // panning is not swiping
  });

  it('forgets everything on a cancel (the browser took over the touch)', () => {
    const swipe = vi.fn();
    const pinchEnd = vi.fn();
    const { g } = setup({ swipe, pinchEnd });
    g.down(ev(1, 150, 200));
    g.down(ev(2, 250, 200));
    g.cancel();
    expect(pinchEnd).toHaveBeenCalledTimes(1);
    g.down(ev(3, 200, 100));
    g.up(ev(3, 200, 260, 100));
    expect(swipe).toHaveBeenCalledWith('down');
  });
});
