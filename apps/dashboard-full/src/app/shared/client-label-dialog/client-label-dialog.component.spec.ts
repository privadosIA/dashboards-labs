import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ClientLabelsStore } from '../../core/client-labels.store';
import { provideAppDynamicForms } from '../dynamic/dynamic-forms.providers';
import { ClientLabelDialogComponent } from './client-label-dialog.component';

describe('ClientLabelDialogComponent', () => {
  let fixture: ComponentFixture<ClientLabelDialogComponent>;
  let labels: { labels: ReturnType<typeof signal<unknown[]>>; setClient: ReturnType<typeof vi.fn> };
  let ref: { close: ReturnType<typeof vi.fn> };

  const el = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el().querySelector(`[data-testid="${id}"]`) as T | null;
  const input = () => (q('client-label-input')!.matches('input') ? q('client-label-input') : q('client-label-input')!.querySelector('input')) as HTMLInputElement;
  const settle = async () => {
    await fixture.whenStable();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const type = async (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    await settle();
  };
  const save = async () => {
    q<HTMLButtonElement>('client-label-save')!.click();
    await settle();
  };
  const refusal = (status: number, message: string) => Promise.reject(new HttpErrorResponse({ status, error: { error: { code: 'x', message } } }));

  async function open(client = 'dashboard-full', setClient = vi.fn(() => Promise.resolve()), kind?: string) {
    labels = { labels: signal<unknown[]>([{ name: 'other-app' }, { name: 'claude-test' }]), setClient };
    ref = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideAppDynamicForms(),
        { provide: MAT_DIALOG_DATA, useValue: { id: 'api-m3d-1', name: 'wooden-chest', client, kind } },
        { provide: MatDialogRef, useValue: ref },
        { provide: ClientLabelsStore, useValue: labels },
      ],
    });
    fixture = TestBed.createComponent(ClientLabelDialogComponent);
    fixture.detectChanges();
    await settle();
  }

  it('shows the item and its label, offers the labels the server knows, and shows an unknown label as empty', async () => {
    await open();
    expect(q('client-label-name')!.textContent).toContain('wooden-chest');
    expect(input().value).toBe('dashboard-full');
    expect(Array.from(el().querySelectorAll('datalist option')).map((o) => (o as HTMLOptionElement).value)).toEqual(['other-app', 'claude-test']);
    TestBed.resetTestingModule();
    await open('unknown');
    expect(input().value).toBe('');
  });

  it('changes the label of the item by id and closes with true', async () => {
    await open();
    await type('claude-test');
    await save();
    expect(labels.setClient).toHaveBeenCalledWith('api-m3d-1', 'claude-test', undefined);
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('gives the store the kind of the item when the host knows it', async () => {
    await open('sample', undefined, 'music_motion');
    await type('other-app');
    await save();
    expect(labels.setClient).toHaveBeenCalledWith('api-m3d-1', 'other-app', 'music_motion');
  });

  it('an emptied label is sent as null', async () => {
    await open();
    await type('');
    await save();
    expect(labels.setClient).toHaveBeenCalledWith('api-m3d-1', null, undefined);
  });

  it('sends nothing when the label did not change', async () => {
    await open();
    await save();
    expect(labels.setClient).not.toHaveBeenCalled();
    expect(ref.close).toHaveBeenCalledWith(false);
  });

  it('does not send a name with capitals or spaces and says what a label may contain', async () => {
    await open();
    await type('Not Valid');
    await save();
    expect(labels.setClient).not.toHaveBeenCalled();
    expect(q('client-label-problem')!.textContent).toMatch(/32|minúsculas/);
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('says the label cannot change while the item runs (409) and stays open', async () => {
    await open('dashboard-full', vi.fn(() => refusal(409, 'generation has an active run')));
    await type('claude-test');
    await save();
    expect(q('client-label-problem')!.textContent).toMatch(/while it is running|mientras se está|mientras corre|mientras se ejecuta/i);
    expect(ref.close).not.toHaveBeenCalled();
    expect(q<HTMLButtonElement>('client-label-save')!.disabled).toBe(false);
  });

  it('shows the server\'s words for any other refusal', async () => {
    await open('dashboard-full', vi.fn(() => refusal(404, 'generation "api-m3d-1" not found')));
    await type('claude-test');
    await save();
    expect(q('client-label-problem')!.textContent).toContain('not found');
  });
});
