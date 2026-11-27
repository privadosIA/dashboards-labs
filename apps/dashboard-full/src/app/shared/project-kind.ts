import type { ProjectKind } from '../core/api.models';

/**
 * What a project row or a kept clip is when it is not an ordinary project, in words for the person: the items of the generation API and the animations of the music mode
 * (`managed=all`). Nothing for an ordinary project and for a kind the dashboard does not know yet (the server may add one): the row then draws no mark.
 */
export function projectKindLabel(kind: ProjectKind | string | undefined): string {
  switch (kind) {
    case 'generation':
      return $localize`:@@projectKind.generation:Generation`;
    case 'image_edit':
      return $localize`:@@projectKind.imageEdit:Image edit`;
    case 'video_edit':
      return $localize`:@@projectKind.videoEdit:Video edit`;
    case 'model_generation':
      return $localize`:@@projectKind.model:3D model`;
    case 'music_motion':
      return $localize`:@@projectKind.animation:Animation`;
    default:
      return '';
  }
}

/** True for an animation of the music mode: a row that opens its piece, not the project editor. */
export const isAnimation = (kind: ProjectKind | string | undefined): boolean => kind === 'music_motion';
