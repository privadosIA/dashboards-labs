import type { Environment } from './environment.model';

/** The public demo (`demo.xuxo.net`, built with `--configuration demo`): it runs against the server mock and says so on every screen. The other sections are not reached from its Projects header: each one has its own dashboard on `examples.xuxo.net`. */
export const environment: Environment = {
  sectionLinks: {
    animation: false,
    video: false,
    music: false,
    flow: false,
    dataset: false,
    models3d: false,
  },
  demoNotice: true,
};
