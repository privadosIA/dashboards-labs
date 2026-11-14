import type { Routes } from '@angular/router';

import { MUSIC_MOTION_BASE } from './core/links';

export interface MusicMotionRoutesOptions {
  /** The path the routes are mounted under in the host: `''` at its root (the default), `/animation` under a section. */
  base?: string;
}

/**
 * The screens of the music-in-motion API as a route table, each loaded when it is first opened. Mount it where the host
 * wants (`children` of a section, or the root) and say where in `base`: the links between the screens are made with it.
 * It has no navigation of its own; a host draws its links from `MUSIC_MOTION_SECTIONS`.
 */
export function musicMotionRoutes({ base = '' }: MusicMotionRoutesOptions = {}): Routes {
  return [
    {
      path: '',
      providers: [{ provide: MUSIC_MOTION_BASE, useValue: base }],
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'songs' },
        { path: 'songs', loadComponent: () => import('./songs/songs.page').then((m) => m.SongsPage) },
        { path: 'new', loadComponent: () => import('./new-piece/new-piece.page').then((m) => m.NewPiecePage) },
        { path: 'pieces', loadComponent: () => import('./pieces/pieces.page').then((m) => m.PiecesPage) },
        { path: 'pieces/:id', loadComponent: () => import('./piece/piece.page').then((m) => m.PiecePage) },
        { path: 'references', loadComponent: () => import('./references/references.page').then((m) => m.ReferencesPage) },
        { path: 'references/:id', loadComponent: () => import('./references/reference.page').then((m) => m.ReferencePage) },
        { path: 'presets', loadComponent: () => import('./presets/presets.page').then((m) => m.PresetsPage) },
        { path: 'presets/new', loadComponent: () => import('./style-builder/style-builder.page').then((m) => m.StyleBuilderPage) },
        { path: 'presets/local/:id', loadComponent: () => import('./style-builder/style-builder.page').then((m) => m.StyleBuilderPage) },
        { path: 'presets/:id', loadComponent: () => import('./presets/preset.page').then((m) => m.PresetPage) },
        { path: 'parts', loadComponent: () => import('./parts/parts.page').then((m) => m.PartsPage) },
        { path: 'parts/new', loadComponent: () => import('./parts/new-part/new-part.page').then((m) => m.NewPartPage) },
        { path: 'parts/mine/:name', loadComponent: () => import('./parts/own-part/own-part.page').then((m) => m.OwnPartPage) },
        { path: 'parts/:id', loadComponent: () => import('./parts/draft.page').then((m) => m.DraftPage) },
        { path: 'datasets', loadComponent: () => import('./datasets/datasets.page').then((m) => m.DatasetsPage) },
        { path: '**', redirectTo: 'songs' },
      ],
    },
  ];
}
