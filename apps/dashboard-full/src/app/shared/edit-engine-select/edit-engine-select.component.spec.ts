import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditEngine } from '../../editor/quality-tiers';
import { EditEngineSelectComponent } from './edit-engine-select.component';

describe('EditEngineSelectComponent', () => {
  async function create(engines: EditEngine[], value: EditEngine | null = null): Promise<ComponentFixture<EditEngineSelectComponent>> {
    await TestBed.configureTestingModule({ imports: [EditEngineSelectComponent] }).compileComponents();
    const f = TestBed.createComponent(EditEngineSelectComponent);
    f.componentRef.setInput('engines', engines);
    f.componentRef.setInput('value', value);
    await f.whenStable();
    f.detectChanges();
    return f;
  }
  const q = (f: ComponentFixture<unknown>, id: string) => (f.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);

  it('asks which engine when both are installed, with the fast one selected and a line about each', async () => {
    const f = await create(['precise', 'fast']);
    expect(q(f, 'edit-engine-fast')).toBeTruthy();
    expect(q(f, 'edit-engine-precise')).toBeTruthy();
    expect(q(f, 'edit-engine-help')?.textContent).toContain('40 s');
    expect(q(f, 'edit-engine-fast')?.classList).toContain('mat-button-toggle-checked');
  });

  it('shows the help of the engine in use', async () => {
    const f = await create(['fast', 'precise'], 'precise');
    expect(q(f, 'edit-engine-help')?.textContent).toContain('uso comercial');
  });

  it('only says which engine it is when there is one', async () => {
    const f = await create(['precise']);
    expect(q(f, 'edit-engine')).toBeNull();
    expect(q(f, 'edit-engine-single')?.textContent).toContain('Qwen-Image-Edit');
  });

  it('emits the engine picked', async () => {
    const f = await create(['fast', 'precise']);
    const picked: EditEngine[] = [];
    f.componentInstance.picked.subscribe((e) => picked.push(e));
    (q(f, 'edit-engine-precise')?.querySelector('button') as HTMLButtonElement).click();
    expect(picked).toEqual(['precise']);
  });
});
