import type { Routes } from '@angular/router';

import { DATASET_STUDIO_BASE } from './core/options';

export interface DatasetStudioRoutesOptions {
  /** Where the host mounts the routes: `''` at its root (the default), `'/dataset'` under a section. The screens link to each other from it. */
  base?: string;
}

/**
 * The screens of the studio: the generator at `studio`, the assistant's providers at `providers` and the library of presets at `presets`; the root leads to the generator. A host mounts them at its root or under a section
 * (`loadChildren: () => import('@lab/dataset-studio-kit').then((m) => m.datasetStudioRoutes({ base: '/dataset' }))`) and gives `base` the same address.
 */
export function datasetStudioRoutes(options: DatasetStudioRoutesOptions = {}): Routes {
  const base = options.base ?? '';
  return [
    {
      path: '',
      providers: [{ provide: DATASET_STUDIO_BASE, useValue: base }],
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'studio' },
        { path: 'studio', loadComponent: () => import('./page/dataset-studio.page').then((m) => m.DatasetStudioPage) },
        { path: 'providers', loadComponent: () => import('./providers/providers.page').then((m) => m.ProvidersPage) },
        { path: 'presets', loadComponent: () => import('./presets/presets-page/presets.page').then((m) => m.PresetsPage) },
      ],
    },
  ];
}
