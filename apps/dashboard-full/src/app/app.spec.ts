import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { provideServerConnection } from '@lab/server-connection';

import { signal } from '@angular/core';

import { App } from './app';
import { PhoneService } from './core/phone.service';
import { SimpleModeStore } from './core/simple-mode.store';

describe('App shell', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
  });

  it('has the Connection button, which opens the connection box', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideServerConnection({ lang: 'en' })] });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="connection"]')!;
    button.click();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
  });

  it('asks which model tasks can run and which providers they use, so the controls that cannot work are not offered', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideServerConnection({ lang: 'en' })] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(http.match('/api/models/availability')).toHaveLength(1);
    expect(http.match('/api/routing')).toHaveLength(1);
  });

  const NAV = [
    '/create',
    '/projects',
    '/runs',
    '/statistics',
    '/gallery',
    '/library',
    '/models',
    '/environment',
    '/api-docs',
    '/settings',
  ];
  const hrefsOf = (el: HTMLElement) => Array.from(el.querySelectorAll('mat-nav-list a')).map((a) => a.getAttribute('href'));

  it('lists the areas of the navigation, and not the Animation, Video and Music sections (which open as windows of their own) or a Music projects entry', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideServerConnection({ lang: 'en' })] });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(hrefsOf(el)).toEqual(NAV);
    for (const gone of ['/animation', '/video', '/music', '/vector', '/motion-edit']) expect(hrefsOf(el)).not.toContain(gone);
  });

  it('shows only Create and Gallery in the simple version', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideServerConnection({ lang: 'en' })] });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(SimpleModeStore).set(true);
    fixture.detectChanges();
    expect(hrefsOf(fixture.nativeElement as HTMLElement)).toEqual(['/create', '/gallery']);
  });

  describe('the current entry', () => {
    const routes = [
      { path: 'projects', children: [{ path: ':id/music', children: [] }] },
      { path: 'runs', children: [{ path: ':id', children: [] }] },
    ];
    async function current(url: string): Promise<string[]> {
      TestBed.configureTestingModule({ providers: [provideRouter(routes), provideServerConnection({ lang: 'en' })] });
      const fixture = TestBed.createComponent(App);
      await TestBed.inject(Router).navigateByUrl(url);
      fixture.detectChanges();
      return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-nav-list a[aria-current="page"]')).map((a) => a.getAttribute('href') ?? '');
    }

    it('is Projects on the projects list and on the page of a project, a music one included', async () => {
      for (const url of ['/projects', '/projects/p1/music']) {
        TestBed.resetTestingModule();
        expect(await current(url), url).toEqual(['/projects']);
      }
    });

    it('is Projects on the list of music projects too: it is the same list, with a mode shown on its own', async () => {
      expect(await current('/projects?mode=music')).toEqual(['/projects']);
    });

    it('is the area on its own addresses', async () => {
      expect(await current('/runs/r1')).toEqual(['/runs']);
    });

    it('marks the active entry with the indicator class too, not only aria-current', async () => {
      TestBed.configureTestingModule({ providers: [provideRouter(routes), provideServerConnection({ lang: 'en' })] });
      const fixture = TestBed.createComponent(App);
      await TestBed.inject(Router).navigateByUrl('/runs/r1');
      fixture.detectChanges();
      const active = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-nav-list a.rail__item--active')).map((a) => a.getAttribute('href'));
      expect(active).toEqual(['/runs']);
    });
  });
});

describe('App shell: the side navigation folds to icons', () => {
  async function open(phone = false) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideServerConnection({ lang: 'en' }), { provide: PhoneService, useValue: { phone: signal(phone) } }],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const click = (el: HTMLElement, testid: string) => (el.querySelector(`[data-testid="${testid}"]`) as HTMLElement).click();
  const rail = (el: HTMLElement) => el.querySelector('mat-sidenav');

  beforeEach(() => localStorage.removeItem('lab-rail-open'));
  afterEach(() => localStorage.removeItem('lab-rail-open'));

  it('starts open, folds to a column of icons with the hamburger and opens again', async () => {
    const { fixture, el } = await open();
    expect(rail(el)?.classList).not.toContain('rail--collapsed');
    click(el, 'rail-collapse');
    fixture.detectChanges();
    expect(rail(el)?.classList).toContain('rail--collapsed');
    expect(rail(el)?.querySelectorAll('mat-icon').length).toBeGreaterThan(8);
    click(el, 'rail-expand');
    fixture.detectChanges();
    expect(rail(el)?.classList).not.toContain('rail--collapsed');
  });

  it('remembers the choice in this browser', async () => {
    const { fixture, el } = await open();
    click(el, 'rail-collapse');
    fixture.detectChanges();
    expect(localStorage.getItem('lab-rail-open')).toBe('0');
    TestBed.resetTestingModule();
    const again = await open();
    expect(rail(again.el)?.classList).toContain('rail--collapsed');
  });

  it('does not offer the fold-away button on a phone, which has its own drawer', async () => {
    const { el } = await open(true);
    expect(el.querySelector('[data-testid="rail-collapse"]')).toBeNull();
    expect(rail(el)?.classList).not.toContain('rail--collapsed');
  });
});

describe('App shell: section windows', () => {
  const routes = [
    { path: 'projects', children: [] },
    { path: 'runs', children: [] },
    { path: 'video', children: [] },
    { path: 'animation', children: [{ path: 'songs', children: [] }] },
    { path: 'music', children: [] },
  ];

  async function openAt(url: string, phone = false) {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideServerConnection({ lang: 'en' }), { provide: PhoneService, useValue: { phone: signal(phone) } }],
    });
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const frame = (el: HTMLElement) => ({
    header: el.querySelector('[data-testid="section-header"]') !== null,
    rail: el.querySelector('mat-sidenav, .rail') !== null,
    brand: el.querySelector('[data-testid="brand"]') !== null,
    topbar: el.querySelector('.topbar') !== null,
    tabBar: el.querySelector('app-tab-bar') !== null,
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
  });

  it('draws a section with the slim header and without the side navigation', async () => {
    for (const url of ['/video', '/music', '/animation/songs']) {
      TestBed.resetTestingModule();
      const { el } = await openAt(url);
      expect(frame(el), url).toEqual({ header: true, rail: false, brand: false, topbar: false, tabBar: false });
    }
  });

  it('draws the other areas with the side navigation and without the header', async () => {
    for (const url of ['/projects', '/runs']) {
      TestBed.resetTestingModule();
      const { el } = await openAt(url);
      expect(frame(el), url).toMatchObject({ header: false, rail: true, brand: true });
    }
  });

  it('names the section in the header and in the title of the browser tab', async () => {
    const { el } = await openAt('/video');
    expect(el.querySelector('[data-testid="section-title"]')?.textContent?.trim()).toBe('Vídeo');
    expect(TestBed.inject(Title).getTitle()).toBe('Vídeo · mediaOrquestator');
  });

  it('has no drawer, no menu button and no tab bar on a phone', async () => {
    const { el } = await openAt('/music', true);
    expect(frame(el)).toEqual({ header: true, rail: false, brand: false, topbar: false, tabBar: false });
    expect(el.querySelector('button[aria-label="Open navigation"]')).toBeNull();
  });

  it('keeps the side navigation and the drawer button of a phone outside the sections', async () => {
    const { el } = await openAt('/projects', true);
    expect(frame(el)).toMatchObject({ header: false, topbar: true });
  });

  it('follows the address: the frame changes when the person moves between a section and another area', async () => {
    const { fixture, el } = await openAt('/projects');
    expect(frame(el).header).toBe(false);
    await TestBed.inject(Router).navigateByUrl('/video');
    fixture.detectChanges();
    expect(frame(el)).toMatchObject({ header: true, rail: false });
    await TestBed.inject(Router).navigateByUrl('/runs');
    fixture.detectChanges();
    expect(frame(el)).toMatchObject({ header: false, rail: true });
  });

  it('draws the old addresses of Motion Edit and Vector as a window of the Animation section', async () => {
    for (const [old, now] of [
      ['/motion-edit', '/animation/motion-edit'],
      ['/vector', '/animation/vector'],
    ]) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([
            { path: 'motion-edit', redirectTo: 'animation/motion-edit' },
            { path: 'vector', redirectTo: 'animation/vector' },
            { path: 'animation', children: [{ path: 'motion-edit', children: [] }, { path: 'vector', children: [] }] },
          ]),
          provideServerConnection({ lang: 'en' }),
          { provide: PhoneService, useValue: { phone: signal(false) } },
        ],
      });
      const fixture = TestBed.createComponent(App);
      const router = TestBed.inject(Router);
      await router.navigateByUrl(old);
      fixture.detectChanges();
      expect(router.url).toBe(now);
      expect(frame(fixture.nativeElement as HTMLElement), old).toEqual({ header: true, rail: false, brand: false, topbar: false, tabBar: false });
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="section-title"]')?.textContent?.trim()).toBe('Animación');
    }
  });
});

