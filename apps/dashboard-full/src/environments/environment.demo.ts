import type { Environment } from './environment.model';

/** The public demo (`demo.xuxo.net`, built with `--configuration demo`): it runs against the server mock and says so on every screen. */
export const environment: Environment = {
  sectionLinks: {
    animation: true,
    video: true,
    music: true,
    flow: true,
    dataset: true,
  },
  demoNotice: true,
};
