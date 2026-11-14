import { TestBed } from '@angular/core/testing';

import { provideThemeSwitch } from '../provide-theme-switch';
import { ThemeService } from '../theme.service';
import { ThemeSwitch } from './theme-switch';

function create(lang: 'es' | 'en', dark: boolean) {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal('matchMedia', () => ({ matches: dark, addEventListener: () => undefined }));
  TestBed.configureTestingModule({ providers: [provideThemeSwitch({ client: 'video-anim', lang })] });
  const fixture = TestBed.createComponent(ThemeSwitch);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = () => el.querySelector<HTMLButtonElement>('[data-testid="theme-switch"]')!;
  return { fixture, el, button, theme: TestBed.inject(ThemeService) };
}

describe('ThemeSwitch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['theme'];
  });

  it('says in English which theme pressing it gives, with an icon that does not depend on the theme', () => {
    const { button, el } = create('en', true);
    expect(button().getAttribute('aria-label')).toBe('Light theme');
    expect(el.querySelector('[data-testid="icon-sun"]')).not.toBeNull();
    expect(el.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('says it in Spanish, and the other way round when the light theme is shown', () => {
    const dark = create('es', true);
    expect(dark.button().getAttribute('aria-label')).toBe('Tema claro');
    TestBed.resetTestingModule();
    const light = create('es', false);
    expect(light.button().getAttribute('aria-label')).toBe('Tema oscuro');
    expect(light.el.querySelector('[data-testid="icon-moon"]')).not.toBeNull();
  });

  it('is a real button that a click switches, relabelling it and pinning the theme', () => {
    const { fixture, button, theme } = create('en', true);
    expect(button().tagName).toBe('BUTTON');
    expect(button().getAttribute('type')).toBe('button');
    button().click();
    fixture.detectChanges();
    expect(theme.theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(button().getAttribute('aria-label')).toBe('Dark theme');
  });
});
