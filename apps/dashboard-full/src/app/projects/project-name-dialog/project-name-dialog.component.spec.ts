import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { NewProjectChoice, ProjectNameDialogComponent, ProjectNameDialogData } from './project-name-dialog.component';

describe('ProjectNameDialogComponent', () => {
  let http: HttpTestingController;
  const close = vi.fn();

  function mount(data: ProjectNameDialogData) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProjectNameDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('offers no style or quality unless the caller asks for them', () => {
    const fixture = mount({ title: 't', confirmLabel: 'ok' });
    http.expectNone('/api/assets/catalog');
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=new-style]')).toBeNull();
  });

  it('shows them, enables only styles with an installed model and records the choice', async () => {
    const choice: NewProjectChoice = {};
    const fixture = mount({ title: 't', confirmLabel: 'ok', choice });
    http.expectOne('/api/assets/catalog').flush({
      entries: [
        { id: 'p', kind: 'model', name: 'P', description: '', size_bytes: 1, installed: true, styles: ['anime'], files: [] },
        { id: 'k', kind: 'model', name: 'K', description: '', size_bytes: 1, installed: false, styles: ['photo'], files: [] },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance as unknown as {
      styles(): { value: string; available: boolean }[];
      setStyle(v: string): void;
      setTier(v: string): void;
    };
    expect(c.styles().map((s) => [s.value, s.available])).toEqual([
      ['photo', false],
      ['anime', true],
      ['general', false],
      ['edit', false],
    ]);
    c.setStyle('anime');
    c.setTier('high');
    expect(choice).toEqual({ style: 'anime', tier: 'high' });
    c.setStyle('');
    expect(choice.style).toBeUndefined();
  });

  it('offers Retoque only when an editing model is installed, and records it as the style', async () => {
    const choice: NewProjectChoice = {};
    const fixture = mount({ title: 't', confirmLabel: 'ok', choice });
    http.expectOne('/api/assets/catalog').flush({
      entries: [{ id: 'k', kind: 'model', name: 'K', description: '', size_bytes: 1, installed: true, edit: true, files: [] }],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance as unknown as { styles(): { value: string; available: boolean }[]; setStyle(v: string): void };
    expect(c.styles().find((s) => s.value === 'edit')?.available).toBe(true);
    c.setStyle('edit');
    expect(choice.style).toBe('edit');
  });

  it('keeps every style disabled when the catalog fails', async () => {
    const fixture = mount({ title: 't', confirmLabel: 'ok', choice: {} });
    http.expectOne('/api/assets/catalog').flush({}, { status: 500, statusText: 'boom' });
    await fixture.whenStable();
    const c = fixture.componentInstance as unknown as { styles(): { available: boolean }[] };
    expect(c.styles().every((s) => !s.available)).toBe(true);
  });

  it('Easy mode asks for nothing else: it clears the style and the quality and is recorded in the choice', async () => {
    const choice: NewProjectChoice = { style: 'anime', tier: 'high' };
    const fixture = mount({ title: 't', confirmLabel: 'ok', choice });
    http.expectOne('/api/assets/catalog').flush({ entries: [] });
    await fixture.whenStable();
    const c = fixture.componentInstance as unknown as { setAuto(on: boolean): void; auto(): boolean };
    c.setAuto(true);
    expect(choice).toEqual({ style: undefined, tier: undefined, auto: true });
    expect(c.auto()).toBe(true);
    c.setAuto(false);
    expect(choice.auto).toBeUndefined();
  });
});
