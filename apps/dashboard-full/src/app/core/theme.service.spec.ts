import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let listeners: ((e: { matches: boolean }) => void)[];
  let mqMatches: boolean;

  beforeEach(() => {
    sessionStorage.clear();
    delete document.documentElement.dataset['theme'];
    listeners = [];
    mqMatches = false;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: mqMatches,
      media: query,
      addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
      removeEventListener: () => {},
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('defaults to dark', () => {
    const svc = TestBed.inject(ThemeService);
    expect(svc.light()).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('moves the theme-color meta with the theme', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#0b1316';
    document.head.appendChild(meta);
    const svc = TestBed.inject(ThemeService);
    svc.set(true);
    expect(meta.content).toBe('#f3f6f6');
    svc.set(false);
    expect(meta.content).toBe('#0b1316');
    meta.remove();
  });

  it('toggle switches the root class and persists for the session', () => {
    const svc = TestBed.inject(ThemeService);
    svc.toggle();
    expect(svc.light()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(sessionStorage.getItem('mo-theme')).toBe('light');

    // A fresh service in the same session restores the choice.
    TestBed.resetTestingModule();
    const again = TestBed.inject(ThemeService);
    expect(again.light()).toBe(true);
  });

  it('exposes and tracks the reduced-motion preference', () => {
    mqMatches = true;
    const svc = TestBed.inject(ThemeService);
    expect(svc.reducedMotion()).toBe(true);

    for (const fn of listeners) fn({ matches: false });
    expect(svc.reducedMotion()).toBe(false);
  });
});
