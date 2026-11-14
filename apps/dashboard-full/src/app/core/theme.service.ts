import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'mo-theme';

/**
 * Theme state: dark darkroom theme by default, optional light theme
 * remembered for the session, and the user's reduced-motion preference
 * exposed as a signal (the strip's settle animation consults it).
 *
 * Switching themes sets `data-theme` on <html> (`dark` or `light`), which pins every colour token and Material's own
 * scheme at once (src/theme/_tokens.scss).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** true when the light theme is active (dark is the default). */
  readonly light = signal(false);

  /** true when the OS asks for reduced motion. */
  readonly reducedMotion = signal(false);

  constructor() {
    document.documentElement.dataset['theme'] ??= 'dark';
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === 'light') {
        this.set(true);
      }
    } catch {
      // storage unavailable: stay on the dark default
    }
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq) {
      this.reducedMotion.set(mq.matches);
      mq.addEventListener('change', (e) => this.reducedMotion.set(e.matches));
    }
  }

  toggle(): void {
    this.set(!this.light());
  }

  set(light: boolean): void {
    this.light.set(light);
    document.documentElement.dataset['theme'] = light ? 'light' : 'dark';
    // The colour of the phone's status bar and of the installed app's title bar follows the theme.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f3f6f6' : '#0b1316');
    try {
      sessionStorage.setItem(STORAGE_KEY, light ? 'light' : 'dark');
    } catch {
      // storage unavailable: the in-memory state still applies
    }
  }
}
