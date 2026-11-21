import { TestBed } from '@angular/core/testing';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { ActionSheetService } from './action-sheet.service';

describe('ActionSheetService', () => {
  let svc: ActionSheetService;
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="sheet-action"]'));

  beforeEach(() => {
    // jsdom never fires animationend, so the sheet would never leave the page.
    TestBed.configureTestingModule({ imports: [MatBottomSheetModule], providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }] });
    svc = TestBed.inject(ActionSheetService);
  });

  afterEach(async () => {
    svc.close();
    TestBed.tick();
    await vi.waitFor(() => expect(document.querySelector('mat-bottom-sheet-container')).toBeNull());
  });

  it('lists the actions under the title, and choosing one runs it and closes the sheet', async () => {
    const run = vi.fn();
    svc.open('Imagen', [
      { icon: 'share', label: 'Compartir', run },
      { icon: 'download', label: 'Descargar', run: () => {} },
    ]);
    TestBed.tick();
    expect(document.querySelector('[data-testid="sheet-title"]')?.textContent).toContain('Imagen');
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Compartir'), expect.stringContaining('Descargar')]);
    rows()[0].click();
    TestBed.tick();
    expect(run).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(rows()).toHaveLength(0));
  });

  it('does not run a disabled action', () => {
    const run = vi.fn();
    svc.open(undefined, [{ label: 'Fijar seed', disabled: true, run }]);
    TestBed.tick();
    rows()[0].click();
    expect(run).not.toHaveBeenCalled();
  });

  it('marks the current option', () => {
    svc.open('Calidad', [{ label: 'Borrador', selected: false, run: () => {} }, { label: 'Alta', selected: true, run: () => {} }]);
    TestBed.tick();
    expect(rows()[1].getAttribute('aria-pressed')).toBe('true');
    expect(rows()[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('closes with the back gesture', async () => {
    svc.open('Imagen', [{ label: 'Compartir', run: () => {} }]);
    TestBed.tick();
    expect(history.state?.moOverlay).toBeDefined();
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(rows()).toHaveLength(0));
  });

  it('takes its history entry off again when it is closed by a tap', async () => {
    svc.open('Imagen', [{ label: 'Compartir', run: () => {} }]);
    TestBed.tick();
    const mine = history.state;
    expect(mine?.moOverlay).toBeDefined();
    svc.close();
    TestBed.tick();
    await vi.waitFor(() => expect(history.state).not.toBe(mine));
  });

  it('opens one sheet at a time: a new one takes the place of the one that is going away', async () => {
    svc.open('A', [{ label: 'uno', run: () => {} }]);
    TestBed.tick();
    svc.open('B', [{ label: 'dos', run: () => {} }]);
    TestBed.tick();
    await vi.waitFor(() => {
      const titles = Array.from(document.querySelectorAll('[data-testid="sheet-title"]')).map((t) => t.textContent?.trim());
      expect(titles).toEqual(['B']);
    });
  });

  it('keeps one history entry for the two, so the back gesture closes the new one', async () => {
    svc.open('A', [{ label: 'uno', run: () => {} }]);
    TestBed.tick();
    const mine = history.state;
    svc.open('B', [{ label: 'dos', run: () => {} }]);
    TestBed.tick();
    expect(history.state).toBe(mine);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(rows()).toHaveLength(0));
  });
});
