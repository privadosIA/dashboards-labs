import { TestBed } from '@angular/core/testing';

import { environment as demo } from '../../../environments/environment.demo';
import { environment } from '../../../environments/environment';
import { environment as tutorial } from '../../../environments/environment.tutorial';
import { DemoNoticeComponent } from './demo-notice.component';

describe('DemoNoticeComponent', () => {
  it('says the data is simulated and has nothing to close it', () => {
    const fixture = TestBed.createComponent(DemoNoticeComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=demo-notice]')?.textContent).toMatch(/Demo (with simulated data|con datos simulados)/);
    expect(el.querySelector('button')).toBeNull();
  });

  it('is asked for only by the demo build', () => {
    expect(demo.demoNotice).toBe(true);
    expect(environment.demoNotice).toBe(false);
    expect(tutorial.demoNotice).toBe(false);
  });
});
