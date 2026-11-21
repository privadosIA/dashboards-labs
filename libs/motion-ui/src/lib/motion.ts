/** The owner's easing, as the stylesheets name it (`ease-lab` in each dashboard's `tailwind.css`). */
export const EASE_LAB = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** The same curve as the four numbers `motion` takes for `ease`. */
export const EASE_LAB_POINTS: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** True when the person asked the system for reduced motion: nothing should move or scale then. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
