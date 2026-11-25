import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { BLENDER_AVAILABLE, provideBlenderAvailable } from './availability';

describe('BLENDER_AVAILABLE', () => {
  it('is not ready for a host that provides nothing', () => {
    expect(TestBed.inject(BLENDER_AVAILABLE)()).toBe(false);
  });

  it('follows the signal the host gives', () => {
    const ready = signal(false);
    TestBed.configureTestingModule({ providers: [provideBlenderAvailable(() => ready)] });
    const token = TestBed.inject(BLENDER_AVAILABLE);
    expect(token()).toBe(false);
    ready.set(true);
    expect(token()).toBe(true);
  });
});
