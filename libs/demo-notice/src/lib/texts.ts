export type DemoNoticeLang = 'es' | 'en';

export interface DemoNoticeTexts {
  /** The bold start: what this is. */
  readonly lead: string;
  /** The rest: what it is not, whose work it is based on, and what happens to what the visitor creates. */
  readonly rest: string;
}

/**
 * The third-party projects these simplified examples are based on, named in one place so every notice and the examples index say the
 * same thing. Naming them says where the idea comes from; it claims no tie with them.
 */
export const THIRD_PARTY_PROJECTS: readonly string[] = ['HeartMuLa', 'Higgsfield'];

const names = THIRD_PARTY_PROJECTS.join(', ');

const TEXTS: Record<DemoNoticeLang, DemoNoticeTexts> = {
  es: {
    lead: 'Ejemplo simplificado con datos simulados:',
    rest: `no es la versión final y se basa en proyectos de terceros (${names}, etc.). Nada de lo que ves aquí es real: lo que crees se comparte con otros visitantes y se borra cada pocas horas.`,
  },
  en: {
    lead: 'Simplified example with simulated data:',
    rest: `it is not the final version and it is based on third-party projects (${names}, etc.). Nothing here is real: what you create is shared with other visitors and erased every few hours.`,
  },
};

/** The words of the notice in the dashboard's language. */
export const demoNoticeTexts = (lang: DemoNoticeLang): DemoNoticeTexts => TEXTS[lang];
