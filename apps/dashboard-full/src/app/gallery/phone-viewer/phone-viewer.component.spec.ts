import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ManifestImage } from '../../core/api.models';
import { PhoneViewerComponent } from './phone-viewer.component';

const image = (n: number): ManifestImage =>
  ({ file: `out/p/img${n}.png`, scene_id: `s${n}`, variant: 0, effective_seed: n, model: 'm', sampler: 'euler', steps: 20, prompt: `prompt ${n}` }) as ManifestImage;

function pointer(type: string, x: number, y: number, t: number): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, clientX: x, clientY: y });
  Object.defineProperty(e, 'timeStamp', { value: t });
  return e;
}

describe('PhoneViewerComponent', () => {
  const close = vi.fn();
  const afterClosed = { subscribe: vi.fn() };

  function render(index = 1) {
    close.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { images: [image(1), image(2), image(3), image(4), image(5)], index, urlOf: (i: ManifestImage) => `/api/${i.file}` } },
        { provide: MatDialogRef, useValue: { close, afterClosed: () => afterClosed } },
      ],
    });
    const fixture = TestBed.createComponent(PhoneViewerComponent);
    fixture.autoDetectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const frame = el.querySelector('[data-testid="viewer"]') as HTMLElement;
    frame.setPointerCapture = () => {};
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800, right: 400, bottom: 800, x: 0, y: 0, toJSON: () => '' });
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const pos = () => q('viewer-pos').textContent?.trim();
    const swipe = (x0: number, y0: number, x1: number, y1: number) => {
      frame.dispatchEvent(pointer('pointerdown', x0, y0, 0));
      frame.dispatchEvent(pointer('pointerup', x1, y1, 90));
      fixture.detectChanges();
    };
    return { fixture, el, frame, q, pos, swipe };
  }

  it('shows the position and the picture', () => {
    const { pos, q } = render();
    expect(pos()).toBe('2 / 5');
    expect(q('viewer-img').getAttribute('src')).toBe('/api/out/p/img2.png');
  });

  it('swipes left to the next picture and right to the previous one', () => {
    const { pos, swipe } = render();
    swipe(300, 400, 120, 405);
    expect(pos()).toBe('3 / 5');
    swipe(100, 400, 300, 405);
    swipe(100, 400, 300, 405);
    expect(pos()).toBe('1 / 5');
    swipe(100, 400, 300, 405); // at the first: stays
    expect(pos()).toBe('1 / 5');
  });

  it('has buttons for previous and next, disabled at the ends', () => {
    const { pos, q, fixture } = render(0);
    expect((q('viewer-prev') as HTMLButtonElement).disabled).toBe(true);
    q('viewer-next').click();
    fixture.detectChanges();
    expect(pos()).toBe('2 / 5');
  });

  it('swipes down to close, and the close button closes too', () => {
    const { swipe, q } = render();
    swipe(200, 200, 205, 420);
    expect(close).toHaveBeenCalledTimes(1);
    q('viewer-close').click();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('double tap zooms in around the tap and a second one returns to the fitted size', () => {
    const { frame, q, fixture } = render();
    const tap = (t: number) => {
      frame.dispatchEvent(pointer('pointerdown', 200, 400, t));
      frame.dispatchEvent(pointer('pointerup', 200, 400, t + 30));
      fixture.detectChanges();
    };
    tap(0);
    tap(120);
    expect(q('viewer-img').style.transform).toContain('scale(2.5)');
    tap(1000);
    tap(1120);
    expect(q('viewer-img').style.transform).toContain('scale(1)');
  });

  it('does not swipe to another picture while zoomed', () => {
    const { q, pos, swipe, fixture } = render();
    q('viewer-zoom-in').click();
    fixture.detectChanges();
    swipe(300, 400, 120, 405);
    expect(pos()).toBe('2 / 5');
  });

  it('zoom buttons work without a pinch and the zoom resets on the next picture', () => {
    const { q, fixture } = render();
    q('viewer-zoom-in').click();
    fixture.detectChanges();
    expect(q('viewer-img').style.transform).toContain('scale(1.6)');
    q('viewer-next').click();
    fixture.detectChanges();
    expect(q('viewer-img').style.transform).toContain('scale(1)');
  });

  it('shows the caption on demand', () => {
    const { q, fixture } = render();
    expect(q('viewer-caption')).toBeNull();
    q('viewer-info').click();
    fixture.detectChanges();
    expect(q('viewer-caption').textContent).toContain('prompt 2');
  });

  it('keeps share and download', () => {
    const { q } = render();
    expect(q('viewer-download').getAttribute('href')).toBe('/api/out/p/img2.png');
    expect(q('viewer-share')).not.toBeNull();
  });
});
