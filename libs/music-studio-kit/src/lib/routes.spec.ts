import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../testing/memory-storage';
import { musicStudioRoutes } from './routes';
import { InMemorySongs } from './song/in-memory.adapter';
import { SONGS } from './song/tokens';

const ports = () => [provideLabForms({ lang: 'en' }), { provide: SONGS, useValue: new InMemorySongs({ pace: 10 }) }];

describe('musicStudioRoutes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens the studio at the root of the host, with the form and "My songs"', async () => {
    stubStorage();
    TestBed.configureTestingModule({ providers: [provideRouter(musicStudioRoutes()), ...ports()] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/');
    expect(harness.routeNativeElement?.textContent).toContain('Custom');
    expect(harness.routeNativeElement?.textContent).toContain('My songs');
  });

  it('works under a section of the host', async () => {
    stubStorage();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'music', children: musicStudioRoutes() }]), ...ports()] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/music');
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/music');
    expect(harness.routeNativeElement?.textContent).toContain('Custom');
    expect(harness.routeNativeElement?.textContent).toContain('My songs');
  });
});
