import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../testing/memory-storage';
import { videoStudioRoutes } from './routes';
import { InMemoryVideoEdit } from './video-edit/in-memory.adapter';
import { VIDEO_EDIT } from './video-edit/tokens';
import { InMemoryVideoGeneration } from './video/in-memory.adapter';
import { VIDEO_GENERATION } from './video/tokens';

const ports = () => [provideLabForms({ lang: 'en' }), { provide: VIDEO_GENERATION, useValue: new InMemoryVideoGeneration() }, { provide: VIDEO_EDIT, useValue: new InMemoryVideoEdit() }];

describe('videoStudioRoutes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens the studio at the root of the host, with its Create and Edit tabs', async () => {
    stubStorage();
    TestBed.configureTestingModule({ providers: [provideRouter(videoStudioRoutes()), ...ports()] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/');
    expect(harness.routeNativeElement?.textContent).toContain('Create video');
    expect(harness.routeNativeElement?.textContent).toContain('Edit video');
  });

  it('works under a section of the host', async () => {
    stubStorage();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'video', children: videoStudioRoutes() }]), ...ports()] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/video');
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/video');
    expect(harness.routeNativeElement?.textContent).toContain('Create video');
    expect(harness.routeNativeElement?.textContent).toContain('History');
  });
});
