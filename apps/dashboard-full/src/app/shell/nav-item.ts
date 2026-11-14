/** One entry of the side navigation: where it goes, its icon and its name. */
export interface NavItem {
  readonly path: string;
  readonly icon: string;
  readonly label: string;
}

/**
 * Whether an entry of the navigation is the current one for an address: its own address and the ones that go on from it (`/runs` on `/runs/r1`);
 * the query and the fragment do not count (`/projects?mode=music` is still Projects).
 */
export function navItemActive(item: NavItem, url: string): boolean {
  const path = url.split('#')[0].split('?')[0];
  return path === item.path || path.startsWith(item.path + '/');
}
