import { inject, provideEnvironmentInitializer } from '@angular/core';
import type { Routes } from '@angular/router';
import { ASSIST_OPTIONS, AssistLanguage } from '@lab/assist-kit';
import { MOTION_EDITOR_LANG } from '@lab/motion-editor';
import { ANIMATION } from '@lab/music-motion';
import { VECTOR_EDITOR_LANG } from '@lab/vector-editor';

import { MOTION_EDIT_OPTIONS } from './core/options';
import { unsavedGuard } from './editor/unsaved.guard';
import { flowProviders } from './flow/providers';

/**
 * The screens and what they bring with them, in a file of their own so that a host that only places the nav and gives the options at the start (`provideMotionEdit`) does not load the libraries
 * of the editor to start: `routes.ts` reaches this file with a dynamic import.
 */
export const screens: Routes = [
  {
    path: '',
    providers: [
      // The editor's libraries speak the language the host gave `provideMotionEdit`.
      { provide: MOTION_EDITOR_LANG, useFactory: () => inject(MOTION_EDIT_OPTIONS).lang },
      { provide: VECTOR_EDITOR_LANG, useFactory: () => inject(MOTION_EDIT_OPTIONS).lang },
      provideEnvironmentInitializer(() => {
        if (!inject(ANIMATION, { optional: true })) {
          throw new Error('The Motion Edit editor needs the port of pieces: provide it with provideMusicMotion({ lang, client, memory }) where provideMotionEdit is provided, or above.');
        }
      }),
    ],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'pieces' },
      { path: 'pieces', loadComponent: () => import('./pieces/pieces.page').then((m) => m.PiecesPage) },
      { path: 'flow', loadChildren: () => import('./flow/flow.routes').then((m) => m.flowRoutes) },
      {
        path: 'pieces/:id',
        // the assistant picker of the scene dialog and of Write all scenes: the same providers as the flow's, in the editor's language
        providers: [
          flowProviders,
          { provide: ASSIST_OPTIONS, useFactory: () => ({ lang: inject(MOTION_EDIT_OPTIONS).lang }) },
          { provide: AssistLanguage, useFactory: () => ({ lang: inject(MOTION_EDIT_OPTIONS).lang }) },
        ],
        loadComponent: () => import('./editor/editor.page').then((m) => m.EditorPage),
        canDeactivate: [unsavedGuard],
      },
    ],
  },
];
