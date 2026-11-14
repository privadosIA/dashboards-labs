import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideMusicStudio } from '@lab/music-studio-kit';
import { provideServerConnection } from '@lab/server-connection';

import { SongStudioShellComponent } from './song-studio-shell.component';

@Component({ template: '<p data-testid="inner">studio</p>' })
class Inner {}

describe('SongStudioShellComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideServerConnection({ lang: 'en' }),
        provideMusicStudio({ lang: 'en', client: 'dashboard-full', memory: true }),
        provideRouter([{ path: 'music', component: SongStudioShellComponent, children: [{ path: '', component: Inner }] }]),
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/music');
    harness.detectChanges();
    return harness;
  }

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('draws the studio under a bar with the Engines button', async () => {
    const harness = await setup();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=song-studio-bar] [data-testid=engines-open]')?.textContent).toContain('Engines');
    expect(el.querySelector('[data-testid=inner]')?.textContent).toBe('studio');
  });

  it('opens the panel of the music engines from the bar', async () => {
    const harness = await setup();
    (harness.routeNativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=engines-open]')!.click();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
  });
});
