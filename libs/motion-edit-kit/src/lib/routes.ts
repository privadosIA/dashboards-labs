import type { Routes } from '@angular/router';

import { MOTION_EDIT_BASE } from './core/options';

export interface MotionEditRoutesOptions {
  /** Where the host mounts the routes: `''` at its root (the default), `'/motion-edit'` under a section. The screens link to each other from it. */
  base?: string;
}

/**
 * The screens of the editor: the list of pieces at `pieces` and one piece at `pieces/:id` (leaving it with changes that are not saved asks first); the root leads to the list. A host
 * mounts them at its root or under a section
 * (`loadChildren: () => import('@lab/motion-edit-kit').then((m) => m.motionEditRoutes({ base: '/motion-edit' }))`) and gives `base` the same address, so that opening a piece and
 * Back land in the right place wherever they are. The table needs `provideMotionEdit` at the start of the application; the screens themselves load with the first one that opens.
 */
export function motionEditRoutes(options: MotionEditRoutesOptions = {}): Routes {
  const base = options.base ?? '';
  return [
    {
      path: '',
      providers: [{ provide: MOTION_EDIT_BASE, useValue: base }],
      loadChildren: () => import('./screens').then((m) => m.screens),
    },
  ];
}
