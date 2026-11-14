import { inject, provideEnvironmentInitializer } from '@angular/core';
import type { Routes } from '@angular/router';
import { ASSIST_OPTIONS, AssistLanguage } from '@lab/assist-kit';
import { SONGS } from '@lab/music-studio-kit';

import { MOTION_EDIT_OPTIONS } from '../core/options';
import { flowProviders } from './providers';

/**
 * The routes of the guided flow, in a file of their own: only they reach `@lab/music-studio-kit`, so a host that never opens the flow does not load it, and the list of
 * pieces keeps working in a host that does not provide the song port.
 */
export const flowRoutes: Routes = [
  {
    path: '',
    providers: [
      flowProviders,
      // the picker speaks the language of the editor; its language service is provided in the root, so it is given here too
      { provide: ASSIST_OPTIONS, useFactory: () => ({ lang: inject(MOTION_EDIT_OPTIONS).lang }) },
      { provide: AssistLanguage, useFactory: () => ({ lang: inject(MOTION_EDIT_OPTIONS).lang }) },
      provideEnvironmentInitializer(() => {
        if (!inject(SONGS, { optional: true })) {
          throw new Error('The Motion Edit flow needs the song port: provide it with provideMusicStudio({ lang, client, memory }) where provideMotionEdit is provided, or above.');
        }
      }),
    ],
    children: [
      { path: '', loadComponent: () => import('./flow.page').then((m) => m.FlowPage) },
      { path: ':id', loadComponent: () => import('./flow.page').then((m) => m.FlowPage) },
    ],
  },
];
