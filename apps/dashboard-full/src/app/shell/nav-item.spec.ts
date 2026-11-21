import { NavItem, navItemActive } from './nav-item';

const PROJECTS: NavItem = { path: '/projects', icon: 'video_library', label: 'Projects' };
const RUNS: NavItem = { path: '/runs', icon: 'play_circle', label: 'Runs' };

describe('navItemActive', () => {
  it('marks Projects on the projects list, with or without a query, and on the pages of a project', () => {
    for (const url of ['/projects', '/projects?mode=music', '/projects?q=demo', '/projects/p1/editor', '/projects/p1/music', '/projects/p1/review']) {
      expect(navItemActive(PROJECTS, url), url).toBe(true);
    }
  });

  it('marks the entry of an area on its sub-addresses and on nothing that only starts with the same letters', () => {
    expect(navItemActive(RUNS, '/runs')).toBe(true);
    expect(navItemActive(RUNS, '/runs/r1')).toBe(true);
    expect(navItemActive(RUNS, '/runs?x=1#top')).toBe(true);
    expect(navItemActive(RUNS, '/runsheet')).toBe(false);
    expect(navItemActive(RUNS, '/projects')).toBe(false);
    expect(navItemActive(PROJECTS, '/runs')).toBe(false);
  });
});
