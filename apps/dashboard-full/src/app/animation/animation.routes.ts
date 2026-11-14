import type { Routes } from '@angular/router';

/**
 * What the Animation section holds besides the screens of `@lab/music-motion`: Motion Edit, the editor of a piece (the result of an animation), and Vector, the studio of vector parts (part of Parts).
 * They go **before** the library's table so that its `**` does not catch them, and each is mounted under `/animation` with the base it needs to link to its own screens.
 */
export const animationExtraRoutes: Routes = [
  {
    path: 'motion-edit',
    loadChildren: () => import('@lab/motion-edit-kit').then((m) => m.motionEditRoutes({ base: '/animation/motion-edit' })),
  },
  {
    path: 'vector',
    loadComponent: () => import('../vector/vector-shell.component').then((m) => m.VectorShellComponent),
    loadChildren: () => import('@lab/vector-studio-kit').then((m) => m.vectorStudioRoutes({ base: '/animation/vector' })),
  },
];
