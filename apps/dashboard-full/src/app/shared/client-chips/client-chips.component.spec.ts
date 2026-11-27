import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';

import { ClientLabelsStore } from '../../core/client-labels.store';
import { ClientChipsComponent } from './client-chips.component';
import { ClientColorDialogComponent } from './client-color-dialog/client-color-dialog.component';

const counts = { projects: 0, animations: 0, generations: 0, image_edits: 0, video_edits: 0, model_generations: 0 };
const label = (name: string, color: string, total: number) => ({ name, color, counts: { ...counts, projects: total }, total, last_used: '2026-11-27T10:00:00Z' });

@Component({
  imports: [ClientChipsComponent],
  template: `<app-client-chips [selected]="on()" (selectedChange)="on.set($event)" />`,
})
class HostComponent {
  readonly on = signal<ReadonlySet<string>>(new Set());
}

describe('ClientChipsComponent', () => {
  let http: HttpTestingController;
  let host: HostComponent;
  let el: HTMLElement;
  let store: ClientLabelsStore;

  async function setup(labels = [label('other-app', '#aa3355', 4), label('embedded', '#2255aa', 9)]) {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ClientLabelsStore);
    store.labels.set(labels);
    const fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  afterEach(() => http?.verify());

  const chips = () => [...el.querySelectorAll<HTMLElement>('.chip')];
  const main = (name: string) => el.querySelector<HTMLButtonElement>(`[data-testid="client-chip-${name}"] .chip-main`)!;

  it('draws a chip per label, in the server order, with its colour and its count', async () => {
    await setup();
    expect(chips().map((c) => c.querySelector('.name')?.textContent?.trim())).toEqual(['other-app', 'embedded']);
    expect(chips()[0].querySelector('.count')?.textContent?.trim()).toBe('4');
    expect(chips()[0].style.getPropertyValue('--chip-color')).toBe('#aa3355');
    expect(chips()[1].style.getPropertyValue('--chip-color')).toBe('#2255aa');
  });

  it('draws nothing when the server reports no label', async () => {
    await setup([]);
    expect(el.querySelector('[data-testid="client-chips"]')).toBeNull();
  });

  it('turns chips on and off, several at once, and says so to assistive technology', async () => {
    const fixture = await setup();
    main('other-app').click();
    fixture.detectChanges();
    main('embedded').click();
    fixture.detectChanges();
    expect([...host.on()]).toEqual(['other-app', 'embedded']);
    expect(main('other-app').getAttribute('aria-pressed')).toBe('true');
    main('other-app').click();
    fixture.detectChanges();
    expect([...host.on()]).toEqual(['embedded']);
    expect(main('other-app').getAttribute('aria-pressed')).toBe('false');
  });

  it('offers to clear the choice only when something is chosen', async () => {
    const fixture = await setup();
    expect(el.querySelector('[data-testid="client-chips-clear"]')).toBeNull();
    main('embedded').click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="client-chips-clear"]')!.click();
    fixture.detectChanges();
    expect(host.on().size).toBe(0);
  });

  it('opens the colour dialog for the label of the menu', async () => {
    const fixture = await setup();
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({} as never);
    el.querySelector<HTMLButtonElement>('[data-testid="client-chip-menu-other-app"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    document.querySelector<HTMLButtonElement>('[data-testid="client-color-change"]')!.click();
    expect(open).toHaveBeenCalledWith(ClientColorDialogComponent, expect.objectContaining({ data: { name: 'other-app' } }));
  });

  it('restores the default colour of the label of the menu', async () => {
    const fixture = await setup();
    el.querySelector<HTMLButtonElement>('[data-testid="client-chip-menu-other-app"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    document.querySelector<HTMLButtonElement>('[data-testid="client-color-restore"]')!.click();
    const req = http.expectOne('/api/clients/other-app');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ color: null });
    req.flush({ name: 'other-app', color: '#39c661' });
    await fixture.whenStable();
    expect(store.colorOf('other-app')).toBe('#39c661');
  });
});
