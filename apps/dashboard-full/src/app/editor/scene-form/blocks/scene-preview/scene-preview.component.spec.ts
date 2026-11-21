import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorStore } from '../../../editor.store';
import { ScenePreviewComponent } from './scene-preview.component';

describe('ScenePreviewComponent', () => {
  let fixture: ComponentFixture<ScenePreviewComponent>;
  const video = () => (fixture.nativeElement as HTMLElement).querySelector('video');
  const none = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid=preview-none]');

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [EditorStore, provideHttpClient(), provideHttpClientTesting()] });
    const store = TestBed.inject(EditorStore);
    const loading = store.load('demo');
    TestBed.inject(HttpTestingController)
      .expectOne('/api/projects/demo/config')
      .flush({ yaml: '', parsed: { project: 'demo', output: { mode: 'video', file: 'o.mp4', contact_sheet: false }, defaults: {}, scenes: [] }, valid: true });
    await loading;
    fixture = TestBed.createComponent(ScenePreviewComponent);
    fixture.componentRef.setInput('sceneId', 'intro');
    fixture.detectChanges();
  });

  it('plays the clip every run keeps, then the intermediate one, then says there is none', () => {
    expect(video()!.getAttribute('src')).toContain('out/clips/intro.mp4');
    video()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(video()!.getAttribute('src')).toContain('tmp/scene_intro.mp4');
    video()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(video()).toBeNull();
    expect(none()).not.toBeNull();
  });

  it('looks again from the first candidate when asked', () => {
    video()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    video()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    (none()!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(video()!.getAttribute('src')).toContain('out/clips/intro.mp4');
  });

  it('starts again from the first candidate for another scene', () => {
    video()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    fixture.componentRef.setInput('sceneId', 'other');
    fixture.detectChanges();
    expect(video()!.getAttribute('src')).toContain('out/clips/other.mp4');
  });
});
