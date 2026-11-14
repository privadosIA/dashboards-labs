import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { stubStorage } from '../../../testing/memory-storage';
import { ConfirmDialog } from './confirm.dialog';

describe('ConfirmDialog look', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has its buttons at least as tall as the control token and a panel title', () => {
    stubStorage({ 'video-studio.lang': 'en' });
    TestBed.configureTestingModule({ providers: [{ provide: MatDialogRef, useValue: { close: () => undefined } }] });
    TestBed.createComponent(ConfirmDialog).detectChanges();
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(styles).toMatch(/button[^{]*\{[^}]*min-height:\s*var\(--lab-control-h\)/);
    expect(styles).toMatch(/h2[^{]*\{[^}]*font-size:\s*var\(--lab-fs-title\)/);
  });
});
