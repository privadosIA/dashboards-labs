import { InjectionToken, inject } from '@angular/core';

/** The path the screens are mounted under in the host: `''` at its root, `/animation` under a section. */
export const MUSIC_MOTION_BASE = new InjectionToken<string>('MUSIC_MOTION_BASE', { providedIn: 'root', factory: () => '' });

/** The address of a screen, as the host mounts it: `link('pieces', id)` is `/pieces/<id>` or `/animation/pieces/<id>`. */
export function linkUnder(base: string, ...parts: readonly string[]): string {
  return [base.replace(/\/+$/, ''), ...parts.map((p) => p.replace(/^\/+|\/+$/g, ''))].join('/') || '/';
}

/** The `link` function of the base the current route was mounted under. Call it in an injection context. */
export function injectLink(): (...parts: readonly string[]) => string {
  const base = inject(MUSIC_MOTION_BASE);
  return (...parts) => linkUnder(base, ...parts);
}
