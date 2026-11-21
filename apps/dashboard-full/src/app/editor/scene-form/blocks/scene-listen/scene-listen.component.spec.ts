import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SceneListenComponent } from './scene-listen.component';

describe('SceneListenComponent', () => {
  let fixture: ComponentFixture<SceneListenComponent>;
  let http: HttpTestingController;
  let played: string[];
  const button = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=scene-listen]')!;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    played = [];
    vi.stubGlobal(
      'Audio',
      class {
        onended?: () => void;
        constructor(public src: string) {}
        play() {
          played.push(this.src);
          return Promise.resolve();
        }
        pause() {}
      },
    );
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:wav', revokeObjectURL: () => {} }));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SceneListenComponent);
    fixture.componentRef.setInput('sceneId', 'a');
    fixture.componentRef.setInput('text', 'hola');
    fixture.componentRef.setInput('voice', 'voices/b.onnx');
    fixture.componentRef.setInput('speaker', 0);
    fixture.componentRef.setInput('speed', 1.5);
    fixture.detectChanges();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks the server for the text with the voice in use and plays it, and stops on a second click', async () => {
    button().click();
    await fixture.whenStable();
    expect(text()).toContain('Preparando');
    const req = http.expectOne('/api/tts/preview');
    expect(req.request.body).toEqual({ text: 'hola', voice: 'voices/b.onnx', speed: 1.5 });
    req.flush(new Blob(['RIFF']));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(played).toEqual(['blob:wav']);
    expect(text()).toContain('Parar');
    button().click();
    fixture.detectChanges();
    expect(text()).toContain('Escuchar');
  });

  it('shows the reason when the server cannot speak', async () => {
    button().click();
    http
      .expectOne('/api/tts/preview')
      .flush(new Blob([JSON.stringify({ error: { code: 'not_found', message: 'voice voices/b.onnx is not installed' } })]), { status: 404, statusText: 'Not Found' });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid=scene-listen-error]')?.textContent).toContain('voice voices/b.onnx is not installed');
  });

  it('cannot listen without a voice or without text, and says why', () => {
    fixture.componentRef.setInput('voice', '');
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    expect(text()).toContain('Elige una voz');
    fixture.componentRef.setInput('voice', 'voices/b.onnx');
    fixture.componentRef.setInput('text', '  ');
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
  });

  it('stops what is playing when the scene changes', async () => {
    button().click();
    http.expectOne('/api/tts/preview').flush(new Blob(['RIFF']));
    await fixture.whenStable();
    fixture.componentRef.setInput('sceneId', 'b');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('Escuchar');
  });
});
