import { EnvironmentProviders, InjectionToken, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';

import { ThemeService } from './theme.service';
import type { ThemeLang } from './texts';

export interface ThemeSwitchOptions {
  /** The dashboard's name: the browser keeps its choice under it. */
  client: string;
  /** The language of the button (the dashboard's own). */
  lang: ThemeLang;
}

export const THEME_CLIENT = new InjectionToken<string>('THEME_CLIENT');
export const THEME_LANG = new InjectionToken<ThemeLang>('THEME_LANG');

/**
 * Provide it once. The service starts with the application, so a remembered choice is pinned before the first screen is drawn
 * and the page does not paint in one theme and then flip.
 */
export function provideThemeSwitch(options: ThemeSwitchOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: THEME_CLIENT, useValue: options.client },
    { provide: THEME_LANG, useValue: options.lang },
    provideAppInitializer(() => void inject(ThemeService)),
  ]);
}
