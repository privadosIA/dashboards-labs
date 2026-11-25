import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BLENDER_AVAILABLE } from '@lab/blender-scene-kit';

import { provideBlenderGate } from './blender-gate';

describe('provideBlenderGate', () => {
  const start = async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideBlenderGate()] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    return TestBed.inject(HttpTestingController);
  };

  it('is false until the environment report arrives, then follows it', async () => {
    const http = await start();
    const ready = TestBed.inject(BLENDER_AVAILABLE);
    expect(ready()).toBe(false);
    http.expectOne('/api/environment').flush({ binaries: [{ name: 'blender', required: false, present: true }], voices: [], loras: [], gpus: [], models: [] });
    await Promise.resolve();
    expect(ready()).toBe(true);
  });

  it('stays false when the report says Blender is missing', async () => {
    const http = await start();
    http.expectOne('/api/environment').flush({ binaries: [{ name: 'blender', required: false, present: false }], voices: [], loras: [], gpus: [], models: [] });
    await Promise.resolve();
    expect(TestBed.inject(BLENDER_AVAILABLE)()).toBe(false);
  });

  it('stays false when the server does not answer', async () => {
    const http = await start();
    http.expectOne('/api/environment').flush('down', { status: 500, statusText: 'Server Error' });
    await Promise.resolve();
    expect(TestBed.inject(BLENDER_AVAILABLE)()).toBe(false);
  });
});
