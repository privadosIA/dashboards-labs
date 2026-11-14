import type { Routes } from '@angular/router';

/**
 * The route of the studio: one page (the form and "My songs"), so it makes no link of its own and a host can mount it at its
 * root or under a section (`loadChildren: () => import('@lab/music-studio-kit').then((m) => m.musicStudioRoutes())`).
 */
export function musicStudioRoutes(): Routes {
  return [{ path: '', pathMatch: 'full', loadComponent: () => import('./studio/studio.page').then((m) => m.StudioPage) }];
}
