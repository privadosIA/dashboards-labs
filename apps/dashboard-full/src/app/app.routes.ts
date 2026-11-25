import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

import { blenderReadyGuard } from './core/blender-ready.guard';
import { SimpleModeStore, allowedInSimple, allowedOnScreen } from './core/simple-mode.store';

/** The simple version has no other screens: their addresses lead to Create. */
const simpleGuard = (_route: unknown, state: { url: string }) =>
  (allowedOnScreen(state.url) && (!inject(SimpleModeStore).simple() || allowedInSimple(state.url))) || inject(Router).parseUrl('/create');

/** The areas of the app, one entry per screen. Each group of the migration adds the ones it brings. */
const allRoutes: Routes = [
  // The root opens Create in the simple version and Projects everywhere else.
  {
    path: '',
    pathMatch: 'full',
    canActivate: [() => inject(Router).parseUrl(inject(SimpleModeStore).simple() ? '/create' : '/projects')],
    children: [],
  },
  {
    path: 'create',
    loadComponent: () => import('./create/create-page.component').then((m) => m.CreatePageComponent),
  },
  {
    path: 'projects',
    loadComponent: () => import('./projects/projects-list/projects-list.component').then((m) => m.ProjectsListComponent),
  },
  {
    path: 'projects/:id/editor',
    loadComponent: () => import('./editor/editor-page/editor-page.component').then((m) => m.EditorPageComponent),
  },
  {
    path: 'projects/:id/models3d',
    canActivate: [blenderReadyGuard],
    loadComponent: () => import('./models3d/models3d-page/models3d-page.component').then((m) => m.Models3dPageComponent),
  },
  {
    path: 'projects/:id/music',
    loadComponent: () => import('./music/music-page/music-page.component').then((m) => m.MusicPageComponent),
  },
  {
    path: 'projects/:id/review',
    loadComponent: () => import('./review/review-page/review-page.component').then((m) => m.ReviewPageComponent),
  },
  {
    path: 'runs',
    loadComponent: () => import('./runs/runs-page/runs-page.component').then((m) => m.RunsPageComponent),
  },
  {
    path: 'runs/:id',
    loadComponent: () => import('./runs/run-monitor/run-monitor.component').then((m) => m.RunMonitorComponent),
  },
  {
    path: 'statistics',
    loadComponent: () => import('./stats/stats-page/stats-page.component').then((m) => m.StatsPageComponent),
  },
  {
    path: 'gallery',
    loadComponent: () => import('./gallery/gallery-page/gallery-page.component').then((m) => m.GalleryPageComponent),
  },
  {
    path: 'library',
    loadComponent: () => import('./music/library/library-page.component').then((m) => m.LibraryPageComponent),
  },
  {
    path: 'models',
    loadComponent: () => import('./models/models-page/models-page.component').then((m) => m.ModelsPageComponent),
  },
  {
    path: 'models/3d',
    canActivate: [blenderReadyGuard],
    loadComponent: () => import('./models/models-3d-page/models-3d-page.component').then((m) => m.Models3dPageComponent),
  },
  {
    path: 'environment',
    loadComponent: () =>
      import('./environment/environment-page/environment-page.component').then((m) => m.EnvironmentPageComponent),
  },
  // The settings are in sections with an address each; `/settings` opens the first one.
  { path: 'settings', pathMatch: 'full', redirectTo: 'settings/assistant' },
  {
    path: 'settings/:section',
    loadComponent: () => import('./settings/settings-page/settings-page.component').then((m) => m.SettingsPageComponent),
  },
  {
    path: 'api-docs',
    loadComponent: () => import('./api-docs/api-docs-page.component').then((m) => m.ApiDocsPageComponent),
  },
  { path: '**', redirectTo: 'projects' },
];

export const routes: Routes = allRoutes.map((r) => (r.path === '' || r.path === '**' || r.path === 'create' || r.path === 'gallery' || r.redirectTo !== undefined ? r : { ...r, canActivate: [simpleGuard, ...(r.canActivate ?? [])] }));
