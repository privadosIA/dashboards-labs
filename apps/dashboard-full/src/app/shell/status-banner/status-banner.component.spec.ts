import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppUpdateService } from '../../core/app-update.service';
import { ServerLinkService } from '../../core/server-link.service';
import { StatusBannerComponent } from './status-banner.component';

describe('StatusBannerComponent', () => {
  const reachable = signal(true);
  const ready = signal(false);
  const check = vi.fn();
  const apply = vi.fn();

  function render(): HTMLElement {
    reachable.set(true);
    ready.set(false);
    check.mockClear();
    apply.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: ServerLinkService, useValue: { reachable, checking: signal(false), check } },
        { provide: AppUpdateService, useValue: { ready, apply } },
      ],
    });
    const fixture = TestBed.createComponent(StatusBannerComponent);
    fixture.autoDetectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const q = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('shows nothing while all is well', () => {
    const el = render();
    expect(q(el, 'server-down')).toBeNull();
    expect(q(el, 'update-ready')).toBeNull();
  });

  it('says the server cannot be reached and retries on a tap', () => {
    const el = render();
    reachable.set(false);
    TestBed.tick();
    expect(q(el, 'server-down')?.textContent).toContain('No se puede conectar');
    q(el, 'server-retry')?.click();
    expect(check).toHaveBeenCalled();
  });

  it('offers the update when a new version is ready and applies it on a tap', () => {
    const el = render();
    ready.set(true);
    TestBed.tick();
    expect(q(el, 'update-ready')).not.toBeNull();
    q(el, 'update-apply')?.click();
    expect(apply).toHaveBeenCalled();
  });
});
