import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { PhoneService } from '../../core/phone.service';
import { Option, OptionRowComponent } from './option-row.component';

const OPTIONS: Option[] = [
  { value: 'draft', label: 'Borrador', testId: 'level-draft' },
  { value: 'normal', label: 'Normal', testId: 'level-normal' },
  { value: 'high', label: 'Alta', testId: 'level-high' },
];

@Component({
  imports: [OptionRowComponent],
  template: `<app-option-row label="Resolución" [options]="options" [value]="value" [disabled]="disabled()" testId="levels" (picked)="value = $event; picks.push($event)" />`,
})
class Host {
  options = OPTIONS;
  value = 'normal';
  disabled = signal(false);
  picks: string[] = [];
}

describe('OptionRowComponent', () => {
  const phone = signal(false);

  function render(isPhone: boolean) {
    phone.set(isPhone);
    TestBed.configureTestingModule({
      imports: [MatBottomSheetModule],
      providers: [
        { provide: PhoneService, useValue: { phone } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, host: fixture.componentInstance };
  }
  const sheetRows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="sheet-action"]'));

  afterEach(async () => {
    document.querySelectorAll<HTMLElement>('.cdk-overlay-backdrop').forEach((b) => b.click());
    await vi.waitFor(() => expect(sheetRows()).toHaveLength(0));
  });

  describe('on a wide screen', () => {
    it('is a row of toggle buttons with the current one pressed, and picking one emits it', () => {
      const { el, host, fixture } = render(false);
      const toggles = Array.from(el.querySelectorAll('mat-button-toggle'));
      expect(toggles.map((t) => t.textContent?.trim())).toEqual(['Borrador', 'Normal', 'Alta']);
      expect(el.querySelector('mat-button-toggle.mat-button-toggle-checked')?.textContent).toContain('Normal');
      (el.querySelector('[data-testid="level-high"] button') as HTMLElement).click();
      fixture.detectChanges();
      expect(host.picks).toEqual(['high']);
      expect(el.querySelector('[data-testid="levels"]')).not.toBeNull();
      expect(el.querySelector('button.line')).toBeNull();
    });
  });

  describe('on a phone', () => {
    it('is one line with the name and the current value', () => {
      const { el } = render(true);
      const line = el.querySelector('button.line') as HTMLButtonElement;
      expect(line.textContent).toContain('Resolución');
      expect(line.textContent).toContain('Normal');
      expect(line.getAttribute('data-testid')).toBe('levels');
      expect(el.querySelector('mat-button-toggle')).toBeNull();
    });

    it('opens a sheet with the choices, the current one marked, and picking one emits it and closes the sheet', async () => {
      const { el, host, fixture } = render(true);
      (el.querySelector('button.line') as HTMLElement).click();
      TestBed.tick();
      expect(sheetRows().map((r) => r.textContent?.trim())).toEqual([expect.stringContaining('Borrador'), expect.stringContaining('Normal'), expect.stringContaining('Alta')]);
      expect(sheetRows()[1].getAttribute('aria-pressed')).toBe('true');
      expect(sheetRows()[0].getAttribute('data-option')).toBe('level-draft');
      sheetRows()[0].click();
      fixture.detectChanges();
      expect(host.picks).toEqual(['draft']);
      await vi.waitFor(() => expect(sheetRows()).toHaveLength(0));
      expect((el.querySelector('button.line') as HTMLElement).textContent).toContain('Borrador');
    });

    it('cannot be opened while disabled', async () => {
      const { el, host, fixture } = render(true);
      host.disabled.set(true);
      await fixture.whenStable();
      expect((el.querySelector('button.line') as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
