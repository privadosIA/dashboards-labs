/** A section that opens as a window of its own: its address, its name and its icon. */
export interface SectionWindow {
  readonly path: string;
  readonly title: string;
  readonly icon: string;
}

/**
 * The sections the dashboard draws without its side navigation (see `SectionHeaderComponent`); none in this edition. A function and not a
 * constant so that the titles are translated when asked for, once the language's messages are loaded.
 */
export function sectionWindows(): readonly SectionWindow[] {
  return [
  ];
}

/** The section window an address belongs to (the address equals its path or goes on from it with `/`; `?` and `#` are ignored), if any. */
export function sectionWindowFor(url: string): SectionWindow | undefined {
  const path = url.split(/[?#]/)[0];
  return sectionWindows().find((s) => path === s.path || path.startsWith(s.path + '/'));
}

/** The addresses of the editors, where every element has to be in view: they take the whole width instead of the centred column the other pages keep. */
const EDITORS: readonly RegExp[] = [/^\/projects\/[^/]+\/editor(\/|$)/];

/** Whether an address (`?` and `#` ignored) is an editor: the editor of a project. */
export function isEditorAddress(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return EDITORS.some((e) => e.test(path));
}

/** Whether a page takes the whole width: the editors. */
export function usesFullWidth(url: string): boolean {
  return isEditorAddress(url);
}
