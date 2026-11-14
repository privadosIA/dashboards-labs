/** The part of a pointer event the recognizer reads (a real PointerEvent has more). */
export interface PointerLike {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
}

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface GestureHandlers {
  /** A quick drag along one axis. */
  swipe?(direction: SwipeDirection): void;
  /** Two fingers: the scale since they touched (1 = no change) around the point between them. */
  pinch?(scale: number, x: number, y: number): void;
  pinchEnd?(): void;
  /** One finger dragging, as the distance moved since the last call; only while `panEnabled()` says so. */
  pan?(dx: number, dy: number): void;
  doubleTap?(x: number, y: number): void;
  longPress?(x: number, y: number): void;
}

export interface GestureOptions {
  /** Touches this close to the left or right edge of the screen are left to the browser (its back gesture). */
  edge: number;
  viewportWidth: () => number;
  /** Whether a single finger pans (an image that is zoomed) rather than swipes. */
  panEnabled?: () => boolean;
  swipeMin?: number;
  longPressMs?: number;
  /** How far a finger may wander and still count as a tap or a press. */
  tolerance?: number;
  doubleTapMs?: number;
  /** For tests. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/** The direction of a drag when it is long enough and clearly along one axis; null otherwise. */
export function swipeDirection(dx: number, dy: number, min: number): SwipeDirection | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < min) return null;
  if (ax > ay * 1.5) return dx < 0 ? 'left' : 'right';
  if (ay > ax * 1.5) return dy < 0 ? 'up' : 'down';
  return null;
}

/** A zoom factor kept between the fitted size and a limit. */
export function clampScale(scale: number, max = 4): number {
  return Math.min(max, Math.max(1, scale));
}

/** The offset of a zoomed image kept so that its edge never goes past the edge of the frame. */
export function clampPan(offset: number, frame: number, scale: number): number {
  const limit = (frame * (scale - 1)) / 2;
  return Math.min(limit, Math.max(-limit, offset));
}

/** How far the content follows a pull-down: it resists the more it is pulled. */
export function pullDistance(dy: number, max = 120): number {
  if (dy <= 0) return 0;
  return max * (1 - Math.exp(-dy / max));
}

/**
 * Turns pointer events into the gestures of a phone screen: swipe, pinch, pan, double tap and long press. It is a
 * plain class fed with events (the directive does that), so each gesture is tested with synthetic sequences. Anything
 * it cannot tell apart is dropped: a swipe is never reported after a pinch, or after a press, or from an edge.
 */
export class GestureRecognizer {
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private start = { x: 0, y: 0, t: 0 };
  private last = { x: 0, y: 0 };
  private pinchStart = 0;
  private pinching = false;
  private spoiled = false; // this touch is not a tap or a swipe any more
  private pressed = false; // the long press fired
  private ignored = false; // started at an edge
  private pressTimer: unknown = null;
  private lastTap: { x: number; y: number; t: number } | null = null;

  private readonly swipeMin: number;
  private readonly longPressMs: number;
  private readonly tolerance: number;
  private readonly doubleTapMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;

  constructor(
    private readonly handlers: GestureHandlers,
    private readonly opts: GestureOptions,
  ) {
    this.swipeMin = opts.swipeMin ?? 50;
    this.longPressMs = opts.longPressMs ?? 500;
    this.tolerance = opts.tolerance ?? 10;
    this.doubleTapMs = opts.doubleTapMs ?? 300;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  down(e: PointerLike): void {
    if (this.pointers.size === 0) {
      const w = this.opts.viewportWidth();
      this.ignored = e.clientX < this.opts.edge || e.clientX > w - this.opts.edge;
      this.spoiled = false;
      this.pressed = false;
      this.start = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      this.last = { x: e.clientX, y: e.clientY };
    }
    if (this.ignored) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1 && this.handlers.longPress) {
      this.pressTimer = this.setTimer(() => {
        this.pressTimer = null;
        this.pressed = true;
        this.spoiled = true;
        this.handlers.longPress?.(this.start.x, this.start.y);
      }, this.longPressMs);
    }
    if (this.pointers.size === 2) {
      this.cancelPress();
      this.spoiled = true;
      this.pinching = true;
      this.pinchStart = this.distance() || 1;
    }
  }

  move(e: PointerLike): void {
    const p = this.pointers.get(e.pointerId);
    if (!p || this.ignored) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size >= 2 && this.pinching) {
      const c = this.center();
      this.handlers.pinch?.(this.distance() / this.pinchStart, c.x, c.y);
      return;
    }
    if (this.pointers.size === 1) {
      if (Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > this.tolerance) this.cancelPress();
      if (this.opts.panEnabled?.() && !this.pressed) {
        this.handlers.pan?.(e.clientX - this.last.x, e.clientY - this.last.y);
        this.spoiled = true;
      }
      this.last = { x: e.clientX, y: e.clientY };
    }
  }

  up(e: PointerLike): void {
    if (this.ignored) {
      this.pointers.delete(e.pointerId);
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.cancelPress();
    if (this.pinching && this.pointers.size < 2) {
      this.pinching = false;
      this.handlers.pinchEnd?.();
    }
    if (this.pointers.size > 0 || this.spoiled) return;
    const dx = e.clientX - this.start.x;
    const dy = e.clientY - this.start.y;
    if (Math.hypot(dx, dy) <= this.tolerance) {
      this.tapped(e);
      return;
    }
    const dir = swipeDirection(dx, dy, this.swipeMin);
    if (dir) this.handlers.swipe?.(dir);
  }

  cancel(): void {
    this.cancelPress();
    if (this.pinching) this.handlers.pinchEnd?.();
    this.pinching = false;
    this.pointers.clear();
  }

  private tapped(e: PointerLike): void {
    const prev = this.lastTap;
    if (prev && e.timeStamp - prev.t <= this.doubleTapMs && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= this.tolerance * 3) {
      this.lastTap = null;
      this.handlers.doubleTap?.(e.clientX, e.clientY);
      return;
    }
    this.lastTap = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  }

  private cancelPress(): void {
    if (this.pressTimer !== null) this.clearTimer(this.pressTimer);
    this.pressTimer = null;
  }

  private distance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private center(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}
