import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { provideServerConnection } from '@lab/server-connection';

import { activeLang } from '../../core/language';
import { ThemeService } from '../../core/theme.service';
import { SectionHeaderComponent } from './section-header.component';

function create(title = 'Vídeo') {
  TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'projects', children: [] }]), provideServerConnection({ lang: 'en' })] });
  const fixture = TestBed.createComponent(SectionHeaderComponent);
  fixture.componentRef.setInput('title', title);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('SectionHeaderComponent', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    document.documentElement.dataset['theme'] = 'dark';
  });

  it('shows the name of the section', () => {
    const { el } = create('Música');
    expect(el.querySelector('[data-testid="section-title"]')?.textContent?.trim()).toBe('Música');
  });

  it('has the mark and name as a link back to Projects, with an accessible name', () => {
    const { el } = create();
    const home = el.querySelector<HTMLAnchorElement>('[data-testid="section-home"]')!;
    expect(home.getAttribute('href')).toBe('/projects');
    expect(home.getAttribute('aria-label')).toBeTruthy();
    expect(home.classList.contains('lab-plain-link')).toBe(true);
    expect(home.textContent).toContain('mediaOrquestator');
  });

  describe('the way back when another tab of the app opened this one', () => {
    const withOpener = () => Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true });
    afterEach(() => {
      Reflect.deleteProperty(window, 'opener');
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    const dialogText = () => document.querySelector('mat-dialog-container')?.textContent ?? '';
    const answer = async (label: RegExp): Promise<void> => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('mat-dialog-container button')].find((b) => label.test(b.textContent ?? ''))!;
      button.click();
      await new Promise((r) => setTimeout(r, 0));
    };

    it('says it is leaving the page and closes the tab only when the person confirms', async () => {
      withOpener();
      const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
      const { el } = create();
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      el.querySelector<HTMLAnchorElement>('[data-testid="section-home"]')!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      await new Promise((r) => setTimeout(r, 0));
      expect(dialogText()).toMatch(/leave this page|salir de esta página/);
      expect(close).not.toHaveBeenCalled();
      await answer(/Close the window|Cerrar la ventana/);
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    });

    it('stays where it is when the person says no', async () => {
      withOpener();
      const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
      const { el } = create();
      el.querySelector<HTMLAnchorElement>('[data-testid="section-home"]')!.click();
      await new Promise((r) => setTimeout(r, 0));
      await answer(/Cancel|Cancelar/);
      expect(close).not.toHaveBeenCalled();
    });

    it('goes to Projects if the browser did not let it close', async () => {
      withOpener();
      vi.spyOn(window, 'close').mockImplementation(() => undefined);
      const { el } = create();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      el.querySelector<HTMLAnchorElement>('[data-testid="section-home"]')!.click();
      await new Promise((r) => setTimeout(r, 0));
      await answer(/Close the window|Cerrar la ventana/);
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/projects'), { timeout: 2000 });
    });

    it('is a plain link to Projects when the tab was opened on its own', () => {
      const { el } = create();
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      el.querySelector<HTMLAnchorElement>('[data-testid="section-home"]')!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true); // the router takes the click: it goes to Projects in this tab
    });
  });

  it('has the Connection button, which opens the connection box', () => {
    const { el } = create();
    el.querySelector<HTMLButtonElement>('[data-testid="connection"]')!.click();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
  });

  it('offers both languages, with the current one chosen', async () => {
    const { fixture, el } = create();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="lang-switch"] mat-button-toggle')).toHaveLength(2);
    const chosen = el.querySelector('[data-testid="lang-switch"] button[aria-checked="true"]')?.closest('mat-button-toggle');
    expect(chosen?.getAttribute('data-testid')).toBe(`lang-${activeLang()}`);
    expect(el.querySelector('[data-testid="lang-en"]')?.textContent).toContain('English');
    expect(el.querySelector('[data-testid="lang-es"]')?.textContent).toContain('Español');
  });

  it('switches the theme', () => {
    const { fixture, el } = create();
    const theme = TestBed.inject(ThemeService);
    expect(theme.light()).toBe(false);
    el.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"] button[role="switch"]')!.click();
    fixture.detectChanges();
    expect(theme.light()).toBe(true);
  });

  it('has no side navigation and no menu of the dashboard of its own', () => {
    const { el } = create();
    expect(el.querySelector('nav, mat-nav-list, mat-sidenav')).toBeNull();
  });
});
