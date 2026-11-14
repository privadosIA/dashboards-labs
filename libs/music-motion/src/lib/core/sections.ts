/** The screens a host links to, in order: the path under the base and the key of its name in the texts' `nav`. */
export const MUSIC_MOTION_SECTIONS = [
  { path: 'new', key: 'new' },
  { path: 'songs', key: 'songs' },
  { path: 'pieces', key: 'pieces' },
  { path: 'references', key: 'references' },
  { path: 'presets', key: 'presets' },
  { path: 'parts', key: 'parts' },
  { path: 'datasets', key: 'datasets' },
] as const;

export type MusicMotionSection = (typeof MUSIC_MOTION_SECTIONS)[number];
