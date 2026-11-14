import { TestBed } from '@angular/core/testing';

import { provideThemeSwitch } from './provide-theme-switch';
import { THEME_STORAGE_PREFIX, ThemeService } from './theme.service';

/** A `matchMedia` the test can change the answer of, like a system that switches between dark and light. */
function stubSystem(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, l: (e: { matches: boolean }) => void) => void listeners.add(l),
  };
  vi.stubGlobal('matchMedia', () => query);
  return (now: boolean) => {
    query.matches = now;
    listeners.forEach((l) => l({ matches: now }));
  };
}

function stubStorage(initial: Record<string, string> = {}, refuse = false) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => {
      if (refuse) throw new Error('blocked');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (refuse) throw new Error('blocked');
      data.set(k, v);
    },
  });
  return data;
}

const create = (client = 'video-anim') => {
  TestBed.configureTestingModule({ providers: [provideThemeSwitch({ client, lang: 'en' })] });
  return TestBed.inject(ThemeService);
};

describe('ThemeService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['theme'];
  });

  it('follows the system and pins nothing until the person chooses', () => {
    stubStorage();
    stubSystem(true);
    const theme = create();
    expect(theme.choice()).toBeNull();
    expect(theme.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('changes with the system while nobody has chosen', () => {
    stubStorage();
    const change = stubSystem(true);
    const theme = create();
    change(false);
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('toggles to the opposite of what is shown, pins it on <html> and remembers it', () => {
    const data = stubStorage();
    stubSystem(true);
    const theme = create();
    theme.toggle();
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(data.get(`${THEME_STORAGE_PREFIX}video-anim`)).toBe('light');
    theme.toggle();
    expect(theme.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('keeps the choice against the system once it is made', () => {
    stubStorage();
    const change = stubSystem(true);
    const theme = create();
    theme.toggle();
    change(true);
    change(false);
    expect(theme.theme()).toBe('light');
    change(true);
    expect(theme.theme()).toBe('light');
  });

  it('pins a remembered choice at start, on a system that wants the other theme', () => {
    stubStorage({ [`${THEME_STORAGE_PREFIX}video-anim`]: 'light' });
    stubSystem(true);
    const theme = create();
    expect(theme.choice()).toBe('light');
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('ignores a stored value that is not a theme', () => {
    stubStorage({ [`${THEME_STORAGE_PREFIX}video-anim`]: 'purple' });
    stubSystem(false);
    expect(create().choice()).toBeNull();
  });

  it('keeps each dashboard\'s choice under its own name', () => {
    const data = stubStorage({ [`${THEME_STORAGE_PREFIX}music-studio`]: 'dark' });
    stubSystem(false);
    const theme = create('video-anim');
    expect(theme.choice()).toBeNull();
    theme.toggle();
    expect([...data.keys()].sort()).toEqual([`${THEME_STORAGE_PREFIX}music-studio`, `${THEME_STORAGE_PREFIX}video-anim`]);
  });

  it('still changes the theme, and throws nothing, when the browser refuses to store', () => {
    stubStorage({}, true);
    stubSystem(true);
    const theme = create();
    expect(() => theme.toggle()).not.toThrow();
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('works where the browser has no matchMedia', () => {
    stubStorage();
    vi.stubGlobal('matchMedia', undefined);
    const theme = create();
    expect(theme.theme()).toBe('light');
  });
});
