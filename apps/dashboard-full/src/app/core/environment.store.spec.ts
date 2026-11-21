import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { EnvironmentStore } from './environment.store';

describe('EnvironmentStore models', () => {
  it('counts the retouch files with the models: the editor looks for every model file there', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const store = TestBed.inject(EnvironmentStore);
    const http = TestBed.inject(HttpTestingController);
    const done = store.refresh();
    http.expectOne('/api/environment').flush({
      binaries: [], voices: [], loras: [], gpus: [],
      models: [{ name: 'sdxl.safetensors', size: 1 }],
      retouch: [{ name: 'Qwen-Image-Edit-2509-Q4_K_M.gguf', size: 2 }, { name: 'qwen_image_vae.safetensors', size: 3 }],
    });
    await done;
    expect(store.models().map((m) => m.name)).toEqual(['sdxl.safetensors', 'Qwen-Image-Edit-2509-Q4_K_M.gguf', 'qwen_image_vae.safetensors']);
  });

  it('works with a report that has no retouch list', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const store = TestBed.inject(EnvironmentStore);
    const http = TestBed.inject(HttpTestingController);
    const done = store.refresh();
    http.expectOne('/api/environment').flush({ binaries: [], voices: [], loras: [], gpus: [], models: [{ name: 'a.safetensors', size: 1 }] });
    await done;
    expect(store.models()).toHaveLength(1);
  });
});
