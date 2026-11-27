import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ClientLabelsStore } from '../../../core/client-labels.store';
import { provideAppDynamicForms } from '../../dynamic/dynamic-forms.providers';
import { ClientColorDialogComponent } from './client-color-dialog.component';

describe('ClientColorDialogComponent', () => {
  let fixture: ComponentFixture<ClientColorDialogComponent>;
  let labels: { colorOf: ReturnType<typeof vi.fn>; setColor: ReturnType<typeof vi.fn> };
  let ref: { close: ReturnType<typeof vi.fn> };

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el().querySelector(`[data-testid="${id}"]`) as T | null;
  const settle = async () => {
    await fixture.whenStable();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const type = async (value: string) => {
    const input = (q('client-color-input')!.matches('input') ? q('client-color-input') : q('client-color-input')!.querySelector('input')) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };

  async function open(setColor = vi.fn(() => Promise.resolve())) {
    labels = { colorOf: vi.fn(() => '#aa3355'), setColor };
    ref = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideAppDynamicForms(),
        { provide: MAT_DIALOG_DATA, useValue: { name: 'other-app' } },
        { provide: MatDialogRef, useValue: ref },
        { provide: ClientLabelsStore, useValue: labels },
      ],
    });
    fixture = TestBed.createComponent(ClientColorDialogComponent);
    fixture.detectChanges();
    await settle();
  }

  it('starts with the colour the label has now', async () => {
    await open();
    const input = q('client-color-input')!.matches('input') ? q('client-color-input') : q('client-color-input')!.querySelector('input');
    expect((input as HTMLInputElement).value).toBe('#aa3355');
    expect(q('client-color-name')!.textContent).toContain('other-app');
  });

  it('keeps the colour typed with the server and closes with it', async () => {
    await open();
    await type('#112233');
    q<HTMLButtonElement>('client-color-save')!.click();
    await settle();
    expect(labels.setColor).toHaveBeenCalledWith('other-app', '#112233');
    expect(ref.close).toHaveBeenCalledWith('#112233');
  });

  it('sends nothing for a text that is not #rrggbb and says what is expected', async () => {
    await open();
    await type('red');
    q<HTMLButtonElement>('client-color-save')!.click();
    await settle();
    expect(labels.setColor).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
    expect(el().textContent).toMatch(/#rrggbb/);
  });

  it('shows the reason of the server when it refuses the colour and stays open', async () => {
    await open(vi.fn(() => Promise.reject(new HttpErrorResponse({ status: 400, error: { error: { code: 'invalid_request', message: 'color: must be #rrggbb' } } }))));
    await type('#112233');
    q<HTMLButtonElement>('client-color-save')!.click();
    await settle();
    expect(q('client-color-problem')!.textContent).toContain('color: must be #rrggbb');
    expect(ref.close).not.toHaveBeenCalled();
  });
});
