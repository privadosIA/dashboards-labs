import type { Gap } from './preview/scene-model';
import type { MotionEditorTexts } from './texts';

/** A gap in the person's language. */
export function gapText(t: MotionEditorTexts, gap: Gap): string {
  switch (gap.kind) {
    case 'missing-part':
      return t.gaps.missingPart(gap.name);
    case 'stage':
      return t.gaps.stagePlaceholders;
    case 'fonts':
      return t.gaps.fontsMayDiffer;
    case 'browser':
      return t.gaps.builtInBrowser;
    case 'keyframes':
      return t.gaps.keyframesNotDrawn;
    case 'layers':
      return t.gaps.layersNotDrawn;
    case 'crossfade':
      return t.gaps.crossfadeApproximated;
  }
}
