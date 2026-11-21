import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BrowserSettings } from '../../core/api.models';
import { BrowserCardComponent } from './browser-card.component';

describe('BrowserCardComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<BrowserCardComponent>;
  let changed: (BrowserSettings | null)[];
  const q = (id: string) => (fixture.nativeElement as HTMLElement).querySelector(`[data-testid=${id}]`);

  function open(browser: BrowserSettings): void {
    TestBed.configureTestingModule({ imports: [BrowserCardComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BrowserCardComponent);
    changed = [];
    fixture.componentInstance.changed.subscribe((b) => changed.push(b));
    fixture.componentRef.setInput('browser', browser);
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('shows the browser in use with its version', () => {
    open({ saved: '', found: true, path: '/usr/bin/google-chrome-stable', version: '126.0.1' });
    expect(q('browser-current')?.textContent).toContain('/usr/bin/google-chrome-stable');
    expect(q('browser-current')?.textContent).toContain('126.0.1');
    expect(q('browser-missing')).toBeNull();
  });

  it('says there is none, with how to fix it', () => {
    open({ saved: '', found: false, error: 'no Chrome or Chromium found: install Google Chrome or Chromium' });
    expect(q('browser-missing')?.textContent).toContain('install Google Chrome');
  });

  it('saves the typed path and reports the browser that results', async () => {
    open({ saved: '', found: false, error: 'none' });
    const input = q('browser-input') as HTMLInputElement;
    input.value = '/opt/chromium/chrome';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (q('browser-save') as HTMLButtonElement).click();
    const req = http.expectOne('/api/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ browser: '/opt/chromium/chrome' });
    const after = { saved: '/opt/chromium/chrome', found: true, path: '/opt/chromium/chrome', version: '1.2' };
    req.flush({ ollama: {}, browser: after });
    await fixture.whenStable();
    expect(changed).toEqual([after]);
    http.match((r) => r.url.startsWith('/api/environment')).forEach((r) => r.flush({ binaries: [] }));
  });

  it('shows the server\'s reason for a path it refuses', async () => {
    open({ saved: '', found: true, path: '/usr/bin/chromium' });
    const input = q('browser-input') as HTMLInputElement;
    input.value = '/nope';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (q('browser-save') as HTMLButtonElement).click();
    http.expectOne('/api/settings').flush({ error: { code: 'invalid', message: 'the browser path "/nope" is not an executable file' } }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(q('browser-error')?.textContent).toContain('not an executable file');
    expect(changed).toEqual([]);
  });

  it('goes back to searching by itself', () => {
    open({ saved: '/opt/x/chrome', found: true, path: '/opt/x/chrome' });
    (q('browser-reset') as HTMLButtonElement).click();
    expect(http.expectOne('/api/settings').request.body).toEqual({ browser: '' });
  });
});
