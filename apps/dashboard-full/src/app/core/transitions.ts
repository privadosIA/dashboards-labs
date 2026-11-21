/** The kinds of transition between scenes: names of ffmpeg's xfade filter, as the server accepts them. */
export const TRANSITION_KINDS = [
  'fade', 'fadeblack', 'fadewhite', 'dissolve',
  'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'circleopen', 'circleclose', 'radial', 'pixelize',
] as const;

/** The name a kind has in the interface's language. */
export function transitionLabel(kind: string): string {
  switch (kind) {
    case 'fade': return $localize`:@@transition.fade:Crossfade`;
    case 'fadeblack': return $localize`:@@transition.fadeblack:Fade through black`;
    case 'fadewhite': return $localize`:@@transition.fadewhite:Fade through white`;
    case 'dissolve': return $localize`:@@transition.dissolve:Dissolve`;
    case 'wipeleft': return $localize`:@@transition.wipeleft:Wipe left`;
    case 'wiperight': return $localize`:@@transition.wiperight:Wipe right`;
    case 'wipeup': return $localize`:@@transition.wipeup:Wipe up`;
    case 'wipedown': return $localize`:@@transition.wipedown:Wipe down`;
    case 'slideleft': return $localize`:@@transition.slideleft:Slide left`;
    case 'slideright': return $localize`:@@transition.slideright:Slide right`;
    case 'slideup': return $localize`:@@transition.slideup:Slide up`;
    case 'slidedown': return $localize`:@@transition.slidedown:Slide down`;
    case 'circleopen': return $localize`:@@transition.circleopen:Circle open`;
    case 'circleclose': return $localize`:@@transition.circleclose:Circle close`;
    case 'radial': return $localize`:@@transition.radial:Radial`;
    case 'pixelize': return $localize`:@@transition.pixelize:Pixelate`;
    default: return kind;
  }
}
