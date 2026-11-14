import { animate, spring, stagger } from 'motion';
import { EASE_LAB_POINTS, prefersReducedMotion } from './motion';

export interface FadeUpOptions {
  /** How far each element rises, in pixels. */
  offset?: number;
  /** Seconds each element takes. */
  duration?: number;
  /** Seconds between one element and the next. */
  gap?: number;
  /** Seconds before the first one starts. */
  delay?: number;
  /** A spring instead of the owner's curve. */
  spring?: boolean;
}

/**
 * Makes the elements fade in and rise a little, one after another, and resolves when the last one has arrived.
 * With reduced motion it leaves them visible in their place at once and resolves without animating.
 */
export async function fadeUp(elements: Iterable<Element> | ArrayLike<Element>, options: FadeUpOptions = {}): Promise<void> {
  const list = Array.from(elements);
  if (list.length === 0) return;
  if (prefersReducedMotion()) {
    for (const el of list) {
      const style = (el as HTMLElement).style;
      style.opacity = '1';
      style.transform = 'none';
    }
    return;
  }
  const { offset = 12, duration = 0.45, gap = 0.06, delay = 0 } = options;
  const keyframes = { opacity: [0, 1], transform: [`translateY(${offset}px)`, 'translateY(0px)'] };
  const timing = options.spring
    ? { type: spring, bounce: 0.2, visualDuration: duration, delay: stagger(gap, { startDelay: delay }) }
    : { duration, ease: EASE_LAB_POINTS, delay: stagger(gap, { startDelay: delay }) };
  await animate(list, keyframes, timing);
}
