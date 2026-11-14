export type ThemeLang = 'es' | 'en';

export interface ThemeTexts {
  /** The label while the dark theme is shown: it says what pressing the button gives. */
  readonly toLight: string;
  /** The label while the light theme is shown. */
  readonly toDark: string;
}

const TEXTS: Record<ThemeLang, ThemeTexts> = {
  es: { toLight: 'Tema claro', toDark: 'Tema oscuro' },
  en: { toLight: 'Light theme', toDark: 'Dark theme' },
};

/** The words of the switch in the dashboard's language. */
export const themeTexts = (lang: ThemeLang): ThemeTexts => TEXTS[lang];
