import { Injectable, computed, inject, signal } from '@angular/core';

import { THEME_CLIENT } from './provide-theme-switch';

export type ThemeChoice = 'light' | 'dark';

/** The storage key of a dashboard's choice is this followed by the dashboard's name, so two dashboards on one origin do not share it. */
export const THEME_STORAGE_PREFIX = 'lab.theme.';

/**
 * The theme of a dashboard. Until the person chooses, `<html>` has no `data-theme` and the system's `prefers-color-scheme` decides, also
 * while the page is open. A choice is pinned as `data-theme` (which the dashboard's tokens answer to), remembered in the browser, and
 * kept for the session when the browser refuses to store it.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly key = THEME_STORAGE_PREFIX + (inject(THEME_CLIENT, { optional: true }) ?? 'dashboard');
  private readonly media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly systemDark = signal(this.media?.matches ?? false);

  /** What the person chose, `null` until they do. */
  readonly choice = signal<ThemeChoice | null>(this.read());
  /** The theme that is shown now. */
  readonly theme = computed<ThemeChoice>(() => this.choice() ?? (this.systemDark() ? 'dark' : 'light'));

  constructor() {
    this.media?.addEventListener?.('change', (e) => this.systemDark.set(e.matches));
    this.pin();
  }

  /** Chooses the theme that is not the one shown. */
  toggle(): void {
    this.choose(this.theme() === 'light' ? 'dark' : 'light');
  }

  choose(choice: ThemeChoice): void {
    this.choice.set(choice);
    try {
      localStorage.setItem(this.key, choice);
    } catch {
      // storage refused: the choice lasts until the page is closed
    }
    this.pin();
  }

  private pin(): void {
    const root = document.documentElement;
    const choice = this.choice();
    if (choice) root.dataset['theme'] = choice;
    else delete root.dataset['theme'];
  }

  private read(): ThemeChoice | null {
    try {
      const stored = localStorage.getItem(this.key);
      return stored === 'light' || stored === 'dark' ? stored : null;
    } catch {
      return null;
    }
  }
}
