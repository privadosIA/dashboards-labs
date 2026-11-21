import { TestBed } from '@angular/core/testing';

import { MOTION_PARTS_LANG, provideMotionParts } from './provide-motion-parts';

describe('provideMotionParts', () => {
  it('says the language of the dashboard', () => {
    TestBed.configureTestingModule({ providers: [provideMotionParts({ lang: 'es' })] });
    expect(TestBed.inject(MOTION_PARTS_LANG)).toBe('es');
  });

  it('is optional: without it nothing is provided and the form falls back to English', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(MOTION_PARTS_LANG, null)).toBeNull();
  });
});
