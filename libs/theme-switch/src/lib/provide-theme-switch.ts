import { EnvironmentProviders, InjectionToken, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';

import { ThemeService } from './theme.service';
import type { ThemeLang } from './texts';

export interface ThemeSwitchOptions {
  /** The dashboard's name: the browser keeps its choice under it. */
  client: string;
  /** The language of the button (the dashboard's own). */
  lang: ThemeLang;
  /** Start light while nobody has chosen, whatever the system prefers; a remembered choice still wins. */
  startsLight?: boolean;
}

export const THEME_CLIENT = new InjectionToken<string>('THEME_CLIENT');
export const THEME_LANG = new InjectionToken<ThemeLang>('THEME_LANG');
export const THEME_STARTS_LIGHT = new InjectionToken<boolean>('THEME_STARTS_LIGHT');

/**
 * Provide it once. The service starts with the application, so a remembered choice is pinned before the first screen is drawn
 * and the page does not paint in one theme and then flip.
 */
export function provideThemeSwitch(options: ThemeSwitchOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: THEME_CLIENT, useValue: options.client },
    { provide: THEME_LANG, useValue: options.lang },
    { provide: THEME_STARTS_LIGHT, useValue: options.startsLight ?? false },
    provideAppInitializer(() => void inject(ThemeService)),
  ]);
}
