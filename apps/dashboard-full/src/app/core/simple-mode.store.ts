import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'mo.simple';

/** The screens the simple version shows: what to make, and what was made. */
export const SIMPLE_PATHS: readonly string[] = ['/create', '/gallery'];

/** Whether an address belongs to a screen the simple version shows. */
export function allowedInSimple(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return SIMPLE_PATHS.some((p) => path === p || path.startsWith(p + '/'));
}

/** Screens a phone never opens, in either version: the API reference and the settings (keys, providers, connection). */
export const NEVER_ON_PHONE: readonly string[] = ['/api-docs', '/settings'];

/** Whether the screen is narrow (a phone). */
export function isNarrow(): boolean {
  return window.matchMedia?.('(max-width: 599px)').matches ?? false;
}

/** Whether an address may be opened on this screen: nothing from NEVER_ON_PHONE on a narrow one, whatever the version. */
export function allowedOnScreen(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return !(isNarrow() && NEVER_ON_PHONE.some((p) => path === p || path.startsWith(p + '/')));
}

/**
 * The simple or the advanced version of the interface: simple (Create and Gallery only) by default on a
 * narrow screen, advanced elsewhere, and what the user chose is remembered in the browser. The browser may
 * refuse to store it (private window, blocked data): the default then applies and nothing is reported.
 */
@Injectable({ providedIn: 'root' })
export class SimpleModeStore {
  readonly simple = signal(this.read());

  private read(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'simple') return true;
      if (raw === 'advanced') return false;
    } catch {
      // no storage: the default
    }
    return isNarrow();
  }

  set(simple: boolean): void {
    this.simple.set(simple);
    try {
      localStorage.setItem(STORAGE_KEY, simple ? 'simple' : 'advanced');
    } catch {
      // not stored: it holds for this visit
    }
  }
}
