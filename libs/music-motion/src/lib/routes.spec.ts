import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of } from 'rxjs';

import { ANIMATION } from './animation/tokens';
import type { AnimationPort } from '@lab/animation-core';
import { MUSIC_MOTION_OPTIONS } from './core/options';
import { musicMotionRoutes } from './routes';
import { TicketService } from '@lab/server-connection';

function providers(port: Partial<AnimationPort>) {
  return [
    { provide: MUSIC_MOTION_OPTIONS, useValue: { lang: 'en', client: 'video-anim' } },
    { provide: ANIMATION, useValue: port as AnimationPort },
    { provide: TicketService, useValue: { withTicket: (u: string) => `${u}?ticket=T` } },
  ];
}

describe('musicMotionRoutes', () => {
  it('opens the songs at the root of the host and links from there to the pieces', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(musicMotionRoutes()), ...providers({ songs: () => new Subject(), pieces: () => of([]) })] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/songs');
    await harness.navigateByUrl('/pieces');
    harness.detectChanges();
    const links = Array.from(harness.routeNativeElement!.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/songs');
    expect(links).toContain('/new');
  });

  it('works under a section of the host, and its links keep the section', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'animation', children: musicMotionRoutes({ base: '/animation' }) }]), ...providers({ songs: () => new Subject(), pieces: () => of([]) })],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/animation/pieces');
    harness.detectChanges();
    const links = Array.from(harness.routeNativeElement!.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/animation/songs');
    expect(links).toContain('/animation/new');
  });
});
