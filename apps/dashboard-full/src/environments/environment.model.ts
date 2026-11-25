/** The settings a build carries; `environment.ts` and the files that replace it all have this shape. */
export interface Environment {
  /** Which buttons of the Projects header that open another section are shown. */
  sectionLinks: Record<'animation' | 'video' | 'music' | 'flow' | 'dataset' | 'models3d', boolean>;
  /** The public demo build shows a permanent notice that the data is simulated (`environment.demo.ts`); no other build does. */
  demoNotice: boolean;
  /** Starts in the light theme when the visitor has not chosen one (the public demo does; the others start dark). */
  lightByDefault: boolean;
}
