import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MetadataDialogComponent, MetadataDialogData, MetadataSelection } from './metadata-dialog.component';

const FOUND = { prompt: 'a red apple', negative_prompt: 'blurry', seed: 42, steps: 25, cfg_scale: 7, model: 'sd15.safetensors' };

function mount(data: Partial<MetadataDialogData> = {}) {
  TestBed.configureTestingModule({
    imports: [MetadataDialogComponent],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: { metadata: FOUND, hasPrompt: false, modelInstalled: null, ...data } },
      { provide: MatDialogRef, useValue: { close: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(MetadataDialogComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const api = fixture.componentInstance as unknown as { selection(): MetadataSelection };
  return { fixture, el, api, q: (sel: string) => el.querySelector(sel) };
}

describe('MetadataDialogComponent', () => {
  it('starts with the prompt, the negative prompt and the seed checked, and steps and cfg unchecked', () => {
    const { api } = mount();
    expect(api.selection()).toEqual({ prompt: 'a red apple', negative_prompt: 'blurry', seed: 42 });
  });

  it('starts with the prompt unchecked and warns when the scene already has one', () => {
    const { api, q } = mount({ hasPrompt: true });
    expect(api.selection()).toEqual({ negative_prompt: 'blurry', seed: 42 });
    expect(q('[data-testid=meta-replace]')?.textContent).toContain('se sustituye');
  });

  it('shows no replace warning when the scene has no prompt', () => {
    expect(mount().q('[data-testid=meta-replace]')).toBeNull();
  });

  it('shows only the fields that were found', () => {
    const { q } = mount({ metadata: { prompt: 'x' } });
    expect(q('[data-testid=meta-prompt]')).not.toBeNull();
    for (const f of ['negative', 'seed', 'steps', 'cfg', 'model']) expect(q(`[data-testid=meta-${f}]`)).toBeNull();
  });

  it('shows the model as information with whether it is installed, and never applies it', () => {
    const yes = mount({ modelInstalled: true });
    expect(yes.q('[data-testid=meta-model]')?.textContent).toContain('sd15.safetensors');
    expect(yes.q('[data-testid=meta-model]')?.textContent).toContain('Instalado');
    expect(yes.api.selection()).not.toHaveProperty('model');
    TestBed.resetTestingModule();
    const no = mount({ modelInstalled: false });
    expect(no.q('[data-testid=meta-model]')?.textContent).toContain('No está instalado');
  });

  it('cannot apply with nothing checked', () => {
    const { fixture, q } = mount({ metadata: { seed: 1 } });
    const apply = () => q('[data-testid=meta-apply]') as HTMLButtonElement;
    expect(apply().disabled).toBe(false);
    (q('[data-testid=meta-seed] input') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(apply().disabled).toBe(true);
  });

  it('renders the found text as text, not as markup', () => {
    const { el } = mount({ metadata: { prompt: '<img src=x onerror=alert(1)>' } });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
