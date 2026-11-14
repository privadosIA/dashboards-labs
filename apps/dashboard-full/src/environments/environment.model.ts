/** The settings a build carries; `environment.ts` and the files that replace it all have this shape. */
export interface Environment {
  /** Which buttons of the Projects header that open another section are shown. */
  sectionLinks: Record<'animation' | 'video' | 'music' | 'flow' | 'dataset', boolean>;
}
