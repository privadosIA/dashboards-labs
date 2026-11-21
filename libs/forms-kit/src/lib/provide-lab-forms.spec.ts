import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DF_OPTIONS_PROVIDER, DYNAMIC_FORMS_CONFIG, DfOption, DfOptionsProvider } from '@core/dynamic-forms';
import { Observable, of } from 'rxjs';

import { provideLabForms } from './provide-lab-forms';

@Injectable()
class FixedOptions implements DfOptionsProvider {
  load(): Observable<DfOption[]> {
    return of([{ value: 'a', label: 'A' }]);
  }
}

describe('provideLabForms', () => {
  it('leaves a hidden field with its value only when asked to', () => {
    TestBed.configureTestingModule({ providers: [provideLabForms({ defaultResetOnHide: false })] });
    expect(TestBed.inject(DYNAMIC_FORMS_CONFIG).defaultResetOnHide).toBe(false);
  });

  it('keeps the library default for hidden fields when nothing is said', () => {
    TestBed.configureTestingModule({ providers: [provideLabForms()] });
    expect(TestBed.inject(DYNAMIC_FORMS_CONFIG).defaultResetOnHide).toBe(true);
  });

  it('gives the library the options provider of the application', () => {
    TestBed.configureTestingModule({ providers: [provideLabForms({ optionsProvider: FixedOptions })] });
    expect(TestBed.inject(DF_OPTIONS_PROVIDER)).toBeInstanceOf(FixedOptions);
  });
});
