import { MIN_HEIGHT, MIN_WIDTH, moveRect, resizeRect } from './window-rect';

const SCREEN = { width: 1300, height: 900 };
const START = { left: 100, top: 60, width: 800, height: 600 };

describe('window-rect', () => {
  it('the right side grows to the right edge of the screen and no further', () => {
    expect(resizeRect(START, 'e', 100, 0, SCREEN)).toEqual({ ...START, width: 900 });
    expect(resizeRect(START, 'e', 5000, 0, SCREEN)).toEqual({ ...START, width: 1200 }); // 100 + 1200 = 1300
  });

  it('the left side grows to the left edge of the screen, keeping the right side where it is', () => {
    expect(resizeRect(START, 'w', -60, 0, SCREEN)).toEqual({ ...START, left: 40, width: 860 });
    expect(resizeRect(START, 'w', -5000, 0, SCREEN)).toEqual({ ...START, left: 0, width: 900 });
  });

  it('the top and the bottom work the same way', () => {
    expect(resizeRect(START, 'n', 0, -40, SCREEN)).toEqual({ ...START, top: 20, height: 640 });
    expect(resizeRect(START, 'n', 0, -5000, SCREEN)).toEqual({ ...START, top: 0, height: 660 });
    expect(resizeRect(START, 's', 0, 5000, SCREEN).height).toBe(840); // 60 + 840 = 900
  });

  it('a corner moves its two sides', () => {
    expect(resizeRect(START, 'nw', -20, -10, SCREEN)).toEqual({ left: 80, top: 50, width: 820, height: 610 });
    expect(resizeRect(START, 'se', 20, 10, SCREEN)).toEqual({ ...START, width: 820, height: 610 });
  });

  it('never gets smaller than the minimum, and the opposite side stays still', () => {
    const w = resizeRect(START, 'w', 5000, 0, SCREEN);
    expect(w.width).toBe(MIN_WIDTH);
    expect(w.left + w.width).toBe(900);
    const n = resizeRect(START, 'n', 0, 5000, SCREEN);
    expect(n.height).toBe(MIN_HEIGHT);
    expect(n.top + n.height).toBe(660);
  });

  it('moving keeps the window within the screen horizontally and the title bar reachable', () => {
    expect(moveRect(START, 50, 30, SCREEN)).toEqual({ ...START, left: 150, top: 90 });
    expect(moveRect(START, -5000, -5000, SCREEN)).toEqual({ ...START, left: 0, top: 0 });
    expect(moveRect(START, 5000, 5000, SCREEN)).toEqual({ ...START, left: 500, top: 852 });
  });
});
