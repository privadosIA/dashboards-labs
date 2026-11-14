import type { Environment } from './environment.model';

/** Build-time settings of the dashboard. `environment.tutorial.ts` replaces this file in the `tutorial` configuration (`npm run dashboard-full:serve:tutorial`). */
export const environment: Environment = {
  sectionLinks: {
    animation: true,
    video: true,
    music: true,
    flow: true,
    dataset: true,
  },
};
