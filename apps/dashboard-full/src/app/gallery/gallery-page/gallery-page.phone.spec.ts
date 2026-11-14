import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';

import { ImagesManifest } from '../../core/api.models';
import { ModeFilterStore } from '../../core/mode-filter.store';
import { PhoneService } from '../../core/phone.service';
import { fakeStorage } from '../../core/storage-fake';
import { PhoneViewerComponent } from '../phone-viewer/phone-viewer.component';
import { GalleryLightboxComponent } from '../gallery-lightbox/gallery-lightbox.component';
import { GalleryPageComponent } from './gallery-page.component';

const MANIFEST: ImagesManifest = {
  project: 'mobile-stills',
  mode: 'images',
  generated_at: '2026-10-09T10:00:00Z',
  images: [
    { scene_id: 'intro', variant: 0, effective_seed: 42, prompt: 'p1', negative_prompt: '', model: 'm', resolution: [640, 360], sampler: 'euler', steps: 4, file: 'out/mobile-stills/intro_v1.png' },
    { scene_id: 'intro', variant: 1, effective_seed: 43, prompt: 'p1', negative_prompt: '', model: 'm', resolution: [640, 360], sampler: 'euler', steps: 4, file: 'out/mobile-stills/intro_v2.png' },
  ],
};

// The gallery on a phone (specs/image-gallery: the full-screen viewer and the bottom sheet of actions).
describe('GalleryPageComponent on a phone', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GalleryPageComponent>;
  const phone = signal(true);
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="sheet-action"]'));
  const el = () => fixture.nativeElement as HTMLElement;

  async function setup(isPhone: boolean, simple = false) {
    phone.set(isPhone);
    const ls = fakeStorage();
    ls.setItem('mo.simple', simple ? 'simple' : 'advanced');
    vi.stubGlobal('localStorage', ls);
    await TestBed.configureTestingModule({
      imports: [GalleryPageComponent, MatBottomSheetModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PhoneService, useValue: { phone } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
    TestBed.inject(ModeFilterStore).showAll();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([{ id: 'mobile-stills', name: 'mobile-stills', mode: 'images', scene_count: 1 }]);
    await fixture.whenStable();
    fixture.detectChanges();
    const done = (fixture.componentInstance as unknown as { selectProject(id: string): Promise<void> }).selectProject('mobile-stills');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http.expectOne('/api/projects/mobile-stills/artifacts/out/mobile-stills/manifest.json').flush(MANIFEST);
    await done;
    fixture.detectChanges();
  }

  afterEach(async () => {
    TestBed.inject(MatDialog).closeAll();
    document.querySelector('mat-bottom-sheet-container') && (await vi.waitFor(() => expect(rows()).toHaveLength(0)).catch(() => {}));
    vi.unstubAllGlobals();
  });

  it('opens an image in the full-screen viewer, not in the dialog', async () => {
    await setup(true);
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open');
    (el().querySelector('[data-testid="gallery-image"]') as HTMLElement).click();
    expect(open.mock.calls[0][0]).toBe(PhoneViewerComponent);
    expect(open.mock.calls[0][1]?.panelClass).toBe('mo-phone-viewer');
  });

  it('keeps the dialog on a wide screen', async () => {
    await setup(false);
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open');
    (el().querySelector('[data-testid="gallery-image"]') as HTMLElement).click();
    expect(open.mock.calls[0][0]).toBe(GalleryLightboxComponent);
  });

  it('the ⋮ button opens a bottom sheet with the actions of the image', async () => {
    await setup(true);
    (el().querySelector('[data-testid="gallery-image-actions"]') as HTMLElement).click();
    TestBed.tick();
    const labels = rows().map((r) => r.textContent ?? '');
    expect(labels.some((l) => l.includes('Compartir'))).toBe(true);
    expect(labels.some((l) => l.includes('Descargar'))).toBe(true);
    expect(labels.some((l) => l.includes('Fijar seed 42'))).toBe(true);
    expect(labels.some((l) => l.includes('Re-renderizar'))).toBe(true);
    expect(labels.some((l) => l.includes('Abrir el proyecto'))).toBe(true);
  });

  it('the simple version has no editor, so the sheet does not offer to open the project', async () => {
    await setup(true, true);
    (el().querySelector('[data-testid="gallery-image-actions"]') as HTMLElement).click();
    TestBed.tick();
    expect(rows().some((r) => (r.textContent ?? '').includes('Abrir el proyecto'))).toBe(false);
    expect(rows().length).toBeGreaterThanOrEqual(4);
  });

  it('opening the project goes to its editor', async () => {
    await setup(true);
    const nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    (el().querySelector('[data-testid="gallery-image-actions"]') as HTMLElement).click();
    TestBed.tick();
    rows().find((r) => (r.textContent ?? '').includes('Abrir el proyecto'))?.click();
    expect(nav).toHaveBeenCalledWith(['/projects', 'mobile-stills', 'editor']);
  });

  it('a long press opens the same sheet and the tap that ends it does not open the image', async () => {
    await setup(true);
    vi.useFakeTimers();
    const frame = el().querySelector('[data-testid="gallery-image"]') as HTMLElement;
    frame.setPointerCapture = () => {};
    const ev = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { pointerId: 1, clientX: 200, clientY: 300, pointerType: 'touch' });
      return e;
    };
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open');
    frame.dispatchEvent(ev('pointerdown'));
    vi.advanceTimersByTime(600);
    vi.useRealTimers();
    TestBed.tick();
    expect(rows().length).toBeGreaterThan(0);
    frame.dispatchEvent(ev('pointerup'));
    frame.click(); // the click a finger lifting after a long press produces
    expect(open).not.toHaveBeenCalled();
    // The next tap does open it.
    frame.click();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('a wide screen keeps the menu and has no sheet button', async () => {
    await setup(false);
    expect(el().querySelector('[data-testid="gallery-image-actions"]')).toBeNull();
    expect(el().querySelector('[data-testid="gallery-image-share"]') ?? el().querySelector('mat-menu')).toBeDefined();
  });
});

describe('GalleryPageComponent on a phone: songs', () => {
  it('a song has one ⋮ button with share, download and the studio, in place of the two inline buttons', async () => {
    const phone = signal(true);
    const ls = fakeStorage();
    ls.setItem('mo.simple', 'advanced');
    vi.stubGlobal('localStorage', ls);
    await TestBed.configureTestingModule({
      imports: [GalleryPageComponent, MatBottomSheetModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PhoneService, useValue: { phone } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    }).compileComponents();
    TestBed.inject(ModeFilterStore).showAll();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/projects').flush([{ id: 'balada', name: 'balada', mode: 'music', scene_count: 0, track_count: 1 }]);
    await fixture.whenStable();
    fixture.detectChanges();
    const done = (fixture.componentInstance as unknown as { selectProject(id: string): Promise<void> }).selectProject('balada');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    http.expectOne('/api/projects/balada/artifacts/out/balada/manifest.json').flush({
      project: 'balada',
      mode: 'music',
      generated_at: '2026-10-11T18:11:03Z',
      tracks: [{ track_id: 'balada', variant: 0, effective_seed: 7, use_lm: false, caption: 'x', synth_model: 'turbo', params: {}, file: 'out/balada/balada_v1.mp3' }],
    });
    await done;
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="gallery-song-share"]')).toBeNull();
    expect(el.querySelector('[data-testid="gallery-song-download"]')).toBeNull();
    (el.querySelector('[data-testid="gallery-song-actions"]') as HTMLElement).click();
    TestBed.tick();
    const labels = Array.from(document.querySelectorAll('[data-testid="sheet-action"]')).map((r) => r.textContent ?? '');
    expect(labels.some((l) => l.includes('Compartir'))).toBe(true);
    expect(labels.some((l) => l.includes('Descargar'))).toBe(true);
    expect(labels.some((l) => l.includes('Abrir en el estudio de música'))).toBe(true);
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
  });
});
