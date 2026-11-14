import type { Routes } from '@angular/router';

import { VECTOR_STUDIO_BASE } from './core/options';
import { unsavedGuard } from './editor/unsaved.guard';

export interface VectorStudioRoutesOptions {
  /** Where the host mounts the routes: `''` at its root (the default), `'/vector'` under a section. The screens link to each other from it. */
  base?: string;
}

/**
 * The screens of the studio: the editor at `editor` (leaving it with changes that are not saved asks first) and the catalog of vector parts at `catalog`;
 * the root leads to the editor. A host mounts them at its root or under a section
 * (`loadChildren: () => import('@lab/vector-studio-kit').then((m) => m.vectorStudioRoutes({ base: '/vector' }))`) and gives `base` the same address, so
 * that Open on a part of the catalog lands in the editor wherever they are.
 */
export function vectorStudioRoutes(options: VectorStudioRoutesOptions = {}): Routes {
  const base = options.base ?? '';
  return [
    {
      path: '',
      providers: [{ provide: VECTOR_STUDIO_BASE, useValue: base }],
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'editor' },
        { path: 'editor', loadComponent: () => import('./editor/editor.page').then((m) => m.EditorPage), canDeactivate: [unsavedGuard] },
        { path: 'catalog', loadComponent: () => import('./catalog/catalog.page').then((m) => m.CatalogPage) },
      ],
    },
  ];
}
