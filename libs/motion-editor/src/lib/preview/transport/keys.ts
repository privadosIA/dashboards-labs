import type { PreviewClock } from '../clock';

/**
 * The keys of the transport: Space toggles play, Home and End go to the start and the end, the left and right arrows step one frame, with
 * Shift one second. Returns whether it took the key, so the caller can stop the browser's own use of it. A key typed in a field is left alone.
 */
export function transportKey(clock: PreviewClock, event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return false;
  switch (event.key) {
    case ' ':
      // a focused button already uses Space to press itself
      if (tag === 'BUTTON') return false;
      clock.toggle();
      return true;
    case 'Home':
      clock.pause();
      clock.seek(0);
      return true;
    case 'End':
      clock.pause();
      clock.seek(clock.duration());
      return true;
    case 'ArrowLeft':
      if (event.shiftKey) clock.nudge(-1);
      else clock.step(-1);
      return true;
    case 'ArrowRight':
      if (event.shiftKey) clock.nudge(1);
      else clock.step(1);
      return true;
    default:
      return false;
  }
}
