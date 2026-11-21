import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ALL_AVAILABLE, missing } from '../../core/availability.fake';
import { AvailabilityStore } from '../../core/availability.store';
import { TrackAssistComponent } from './track-assist.component';

describe('TrackAssistComponent: availability', () => {
  function mount(data: ReturnType<typeof missing> | null) {
    TestBed.configureTestingModule({ imports: [TrackAssistComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    if (data) TestBed.inject(AvailabilityStore).data.set(data);
    const f = TestBed.createComponent(TrackAssistComponent);
    f.componentRef.setInput('trackId', 't1');
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }
  const toggle = (el: HTMLElement) => el.querySelector('[data-testid="assist-toggle"]');
  const notice = (el: HTMLElement) => el.querySelector('[data-testid="model-notice"]');

  it('shows "Write with AI" when the assistant can run', () => {
    expect(toggle(mount(ALL_AVAILABLE as never))).not.toBeNull();
  });

  it('hides it and explains a missing model', () => {
    const el = mount(missing('assistant', 'no_models'));
    expect(toggle(el)).toBeNull();
    expect(notice(el)).not.toBeNull();
  });

  it('hides it silently when nothing answers, and while unknown', () => {
    const down = mount(missing('assistant', 'unreachable'));
    expect(toggle(down)).toBeNull();
    expect(notice(down)).toBeNull();
  });
});
