import type { Environment } from './environment.model';

/** The tutorials are recorded without the buttons that open other sections, so that they are not in the picture. */
export const environment: Environment = {
  sectionLinks: {
    animation: false,
    video: false,
    music: false,
    flow: false,
    dataset: false,
  },
};
