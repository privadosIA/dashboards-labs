import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { EnvironmentPageComponent } from './environment-page.component';

describe('EnvironmentPageComponent: the disk', () => {
  async function open(disk?: object) {
    await TestBed.configureTestingModule({ imports: [EnvironmentPageComponent], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EnvironmentPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/environment').flush({ binaries: [], models: [], voices: [], loras: [], gpus: [], ...(disk ? { disk } : {}) });
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the free and total space, with a warning when it is low', async () => {
    const el = await open({ free_bytes: 3e9, total_bytes: 1e12, warn_below_bytes: 20e9, low: true });
    expect(el.querySelector('[data-testid=disk-free-env]')?.textContent).toContain('2,8 GB');
    expect(el.querySelector('[data-testid=disk-low]')?.textContent).toContain('Queda poco espacio');
  });

  it('shows no warning with enough space, and no panel when the disk is unknown', async () => {
    const ok = await open({ free_bytes: 500e9, total_bytes: 1e12, warn_below_bytes: 20e9, low: false });
    expect(ok.querySelector('[data-testid=disk-panel]')).toBeTruthy();
    expect(ok.querySelector('[data-testid=disk-low]')).toBeNull();
  });
});
