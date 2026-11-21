import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AppOptionsProvider, OptionSourceRegistry } from './option-sources';

describe('option sources', () => {
  it('answers from what a component registered, and with nothing for an unknown endpoint', () => {
    TestBed.configureTestingModule({ providers: [AppOptionsProvider] });
    TestBed.inject(OptionSourceRegistry).register('x:list', (p) => of([{ value: p['a'] as string, label: 'A' }]));
    const provider = TestBed.inject(AppOptionsProvider);
    const got: unknown[] = [];
    provider.load('x:list', { a: '1' }).subscribe((o) => got.push(o));
    provider.load('nope', {}).subscribe((o) => got.push(o));
    expect(got).toEqual([[{ value: '1', label: 'A' }], []]);
  });
});
