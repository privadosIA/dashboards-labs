import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingSource } from '../../core/api.models';
import { SourceChipComponent } from './source-chip.component';

describe('SourceChipComponent', () => {
  let fixture: ComponentFixture<SourceChipComponent>;
  const show = (source: SettingSource) => {
    fixture.componentRef.setInput('source', source);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.chip') as HTMLElement;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SourceChipComponent] });
    fixture = TestBed.createComponent(SourceChipComponent);
  });

  it('says a value saved here', () => {
    const chip = show('setting');
    expect(chip.textContent?.trim()).toBe('guardado aquí');
    expect(chip.dataset['source']).toBe('setting');
  });

  it('says a value that comes from the environment', () => {
    expect(show('env').textContent?.trim()).toBe('del entorno');
  });

  it('says a default', () => {
    expect(show('default').textContent?.trim()).toBe('por defecto');
  });

  it('follows the source when it changes, without being rebuilt', () => {
    const chip = show('default');
    show('setting');
    expect(chip.textContent?.trim()).toBe('guardado aquí');
  });
});
