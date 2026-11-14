import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { EnvironmentStore } from '../../core/environment.store';
import { GpuWarningsComponent } from './gpu-warnings.component';

describe('GpuWarningsComponent', () => {
  it('frees the memory Ollama keeps and says what it dropped', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(GpuWarningsComponent);
    fixture.componentRef.setInput('gpu', { index: 1, name: 'x', free_vram_mb: 9000, ollama_mb: 4096 });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=gpu-low-vram]')).toBeNull();
    (el.querySelector('[data-testid=gpu-free-ollama]') as HTMLButtonElement).click();

    http.expectOne((r) => r.url.endsWith('/environment/ollama/unload')).flush({ unloaded: ['qwen3.8:27b'] });
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('/environment')).flush({ gpus: [{ index: 1, name: 'x', free_vram_mb: 18000 }] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=gpu-freed]')?.textContent).toContain('qwen3.8:27b');
    expect(TestBed.inject(EnvironmentStore).gpus()[0].free_vram_mb).toBe(18000);
  });
});
