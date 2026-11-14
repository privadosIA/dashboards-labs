import type { Routes } from '@angular/router';

/**
 * The route of the studio: one page with its own tabs, so it makes no link of its own and a host can mount it at its root
 * or under a section (`loadChildren: () => import('@lab/video-studio-kit').then((m) => m.videoStudioRoutes())`).
 */
export function videoStudioRoutes(): Routes {
  return [{ path: '', pathMatch: 'full', loadComponent: () => import('./studio/studio.page').then((m) => m.StudioPage) }];
}
