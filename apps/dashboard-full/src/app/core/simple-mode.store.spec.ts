import { TestBed } from '@angular/core/testing';

import { fakeStorage } from './storage-fake';
import { SimpleModeStore, allowedInSimple } from './simple-mode.store';

function matchMedia(narrow: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: narrow, addEventListener: () => undefined }));
}

describe('SimpleModeStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    TestBed.resetTestingModule();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts simple on a narrow screen and advanced on a wide one', () => {
    matchMedia(true);
    expect(TestBed.inject(SimpleModeStore).simple()).toBe(true);
    TestBed.resetTestingModule();
    matchMedia(false);
    expect(TestBed.inject(SimpleModeStore).simple()).toBe(false);
  });

  it('remembers what the user chose over the default', () => {
    matchMedia(true);
    TestBed.inject(SimpleModeStore).set(false);
    TestBed.resetTestingModule();
    expect(TestBed.inject(SimpleModeStore).simple()).toBe(false);
  });

  it('lets only Create and Gallery through', () => {
    expect(allowedInSimple('/create')).toBe(true);
    expect(allowedInSimple('/gallery?project=x')).toBe(true);
    expect(allowedInSimple('/projects')).toBe(false);
    expect(allowedInSimple('/runs/3')).toBe(false);
  });
});
