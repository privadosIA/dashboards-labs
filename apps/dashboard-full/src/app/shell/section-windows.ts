/** A section that opens as a window of its own: its address, its name and its icon. */
export interface SectionWindow {
  readonly path: string;
  readonly title: string;
  readonly icon: string;
}

/**
 * Animation, Video, Music and Dataset: the sections the dashboard draws without its side navigation (see `SectionHeaderComponent`). A function and not a
 * constant so that the titles are translated when asked for, once the language's messages are loaded.
 */
export function sectionWindows(): readonly SectionWindow[] {
  return [
    { path: '/animation', title: $localize`:@@nav.animation:Animation`, icon: 'animation' },
    { path: '/video', title: $localize`:@@nav.video:Video`, icon: 'movie' },
    { path: '/music', title: $localize`:@@nav.songStudio:Music`, icon: 'music_note' },
    { path: '/dataset', title: $localize`:@@nav.dataset:Dataset`, icon: 'dataset' },
  ];
}

/** The section window an address belongs to (the address equals its path or goes on from it with `/`; `?` and `#` are ignored), if any. */
export function sectionWindowFor(url: string): SectionWindow | undefined {
  const path = url.split(/[?#]/)[0];
  return sectionWindows().find((s) => path === s.path || path.startsWith(s.path + '/'));
}

/** The addresses of the editors, where every element has to be in view: they take the whole width instead of the centred column the other pages keep. */
const EDITORS: readonly RegExp[] = [/^\/animation\/motion-edit\/pieces\/[^/]+/, /^\/animation\/vector\/editor(\/|$)/, /^\/projects\/[^/]+\/editor(\/|$)/];

/** Whether an address (`?` and `#` ignored) is an editor: the piece in Motion Edit, the Vector editor, the editor of a project. */
export function isEditorAddress(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return EDITORS.some((e) => e.test(path));
}

/** Whether a page takes the whole width: the editors, and every page of Animation, where the lists, the cards and the editors are laid out to the full width of the window. */
export function usesFullWidth(url: string): boolean {
  return isEditorAddress(url) || sectionWindowFor(url)?.path === '/animation';
}
