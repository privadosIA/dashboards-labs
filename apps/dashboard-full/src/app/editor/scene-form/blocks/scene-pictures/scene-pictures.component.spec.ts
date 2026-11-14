import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorStore } from '../../../editor.store';
import { ScenePicturesComponent } from './scene-pictures.component';

const MANIFEST = {
  images: [
    { scene_id: 'intro', variant: 1, file: 'out/demo/intro_v2.png', prompt: 'b' },
    { scene_id: 'intro', variant: 0, file: 'out/demo/intro_v1.png', prompt: 'a' },
    { scene_id: 'other', variant: 0, file: 'out/demo/other.png', prompt: 'c' },
  ],
};

describe('ScenePicturesComponent', () => {
  let fixture: ComponentFixture<ScenePicturesComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  async function open(mode: 'images' | 'video'): Promise<void> {
    TestBed.configureTestingModule({ providers: [EditorStore, provideHttpClient(), provideHttpClientTesting()] });
    const store = TestBed.inject(EditorStore);
    http = TestBed.inject(HttpTestingController);
    const loading = store.load('demo');
    http
      .expectOne('/api/projects/demo/config')
      .flush({ yaml: '', parsed: { project: 'demo', output: { mode, file: '', contact_sheet: false }, defaults: {}, scenes: [] }, valid: true });
    await loading;
    fixture = TestBed.createComponent(ScenePicturesComponent);
    fixture.componentRef.setInput('sceneId', 'intro');
    fixture.detectChanges();
  }

  it('shows one thumbnail per variant of the scene, in order, from the export manifest', async () => {
    await open('images');
    http.expectOne('/api/projects/demo/artifacts/out/demo/manifest.json').flush(MANIFEST);
    await fixture.whenStable();
    fixture.detectChanges();
    const thumbs = Array.from(el().querySelectorAll('.pictures__thumb img')).map((i) => i.getAttribute('src'));
    expect(thumbs.length).toBe(2);
    expect(thumbs[0]).toContain('intro_v1.png');
    expect(thumbs[1]).toContain('intro_v2.png');
  });

  it('says there are none yet, and looks again when asked', async () => {
    await open('images');
    http.expectOne('/api/projects/demo/artifacts/out/demo/manifest.json').flush('', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid=pictures-none]')).not.toBeNull();
    (el().querySelector('[data-testid=pictures-none] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/api/projects/demo/artifacts/out/demo/manifest.json').flush(MANIFEST);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelectorAll('.pictures__thumb').length).toBe(2);
  });

  it('asks for nothing in a video project', async () => {
    await open('video');
    http.expectNone('/api/projects/demo/artifacts/out/demo/manifest.json');
    expect(el().querySelector('[data-testid=pictures-none]')).not.toBeNull();
  });
});
