import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SliderFieldComponent } from './slider-field.component';

describe('SliderFieldComponent', () => {
  let fixture: ComponentFixture<SliderFieldComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SliderFieldComponent);
    fixture.componentRef.setInput('label', 'grano');
    fixture.componentRef.setInput('value', 0.3);
    fixture.componentRef.setInput('testId', 'grain');
    fixture.detectChanges();
  });

  it('shows the label and the value beside the slider', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('grano');
    expect(text).toContain('0.3');
    expect(fixture.nativeElement.querySelector('[data-testid=grain]')).not.toBeNull();
  });

  it('says the new value when the slider moves', () => {
    const got: number[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => got.push(v));
    const input = fixture.nativeElement.querySelector('input[matSliderThumb], input[type=range]') as HTMLInputElement;
    input.value = '0.5';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    expect(got.at(-1)).toBe(0.5);
  });
});
