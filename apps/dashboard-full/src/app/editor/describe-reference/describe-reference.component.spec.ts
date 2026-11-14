import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { AvailabilityStore } from '../../core/availability.store';
import { EditorStore } from '../editor.store';
import { DescribeReferenceComponent } from './describe-reference.component';

/** Both describe tasks lack the model (they share a provider in practice). */
function bothMissing(reason: 'no_vision_model' | 'unreachable'): ReturnType<typeof missing> {
  const d = missing('describe_image', reason);
  d.tasks.describe_video = d.tasks.describe_image;
  return d;
}

describe('DescribeReferenceComponent: availability', () => {
  function mount(data: ReturnType<typeof missing> | null) {
    TestBed.configureTestingModule({
      imports: [DescribeReferenceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EditorStore, useValue: { projectId: signal('p'), sourceError: signal(null) } },
      ],
    });
    if (data) TestBed.inject(AvailabilityStore).data.set(data);
    const f = TestBed.createComponent(DescribeReferenceComponent);
    f.componentRef.setInput('sceneId', 's1');
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }
  const pick = (el: HTMLElement) => el.querySelector('[data-testid="describe-pick"]');
  const notice = (el: HTMLElement) => el.querySelector('[data-testid="model-notice"]');

  it('shows its controls when a picture or a clip can be described', () => {
    const el = mount(ALL_AVAILABLE as never);
    expect(pick(el)).not.toBeNull();
    expect(notice(el)).toBeNull();
  });

  it('hides them and tells which model to install when Ollama has none that reads pictures', () => {
    const el = mount(bothMissing('no_vision_model'));
    expect(pick(el)).toBeNull();
    expect(notice(el)?.textContent).toContain('ollama pull gemma4:26b');
  });

  it('keeps them when only the clip task is without a model but a picture can be described', () => {
    const data = missing('describe_video', 'no_vision_model');
    expect(pick(mount(data))).not.toBeNull();
  });

  it('hides them with no notice when nothing answers', () => {
    const el = mount(bothMissing('unreachable'));
    expect(pick(el)).toBeNull();
    expect(notice(el)).toBeNull();
  });

  it('is hidden while the availability is unknown', () => {
    const el = mount(null);
    expect(pick(el)).toBeNull();
    expect(notice(el)).toBeNull();
  });
});
