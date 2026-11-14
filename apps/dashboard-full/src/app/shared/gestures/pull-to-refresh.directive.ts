import { Directive, ElementRef, OnDestroy, OnInit, inject, output, signal } from '@angular/core';

import { PhoneService } from '../../core/phone.service';
import { pullDistance } from './gestures';

/** How far down the finger must go (before the resistance) for the release to refresh. */
export const PULL_THRESHOLD = 80;

/** The nearest ancestor that scrolls, which is where the page really starts. */
function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/**
 * Pull down from the top of the page to refresh it, on a phone. `distance` is how far the content has followed the
 * finger (for an indicator); releasing past the threshold emits `refresh`. It only acts when the page is scrolled
 * to the very top, so it never fights the scroll, and the screen keeps its own refresh button for everyone else.
 */
@Directive({ selector: '[moPullToRefresh]', exportAs: 'moPullToRefresh' })
export class PullToRefreshDirective implements OnInit, OnDestroy {
  readonly refresh = output<void>();
  /** How far the content is pulled, in pixels; 0 when idle. */
  readonly distance = signal(0);
  /** True once the pull is far enough that releasing refreshes. */
  readonly ready = signal(false);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly phone = inject(PhoneService).phone;
  private startY: number | null = null;
  private raw = 0;
  private scroller!: HTMLElement;

  private readonly onStart = (e: TouchEvent) => {
    if (!this.phone() || e.touches.length !== 1) return;
    this.scroller = scrollParent(this.el);
    this.startY = this.scroller.scrollTop <= 0 ? e.touches[0].clientY : null;
    this.raw = 0;
  };

  private readonly onMove = (e: TouchEvent) => {
    if (this.startY === null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - this.startY;
    if (dy <= 0 || this.scroller.scrollTop > 0) {
      this.reset();
      return;
    }
    this.raw = dy;
    // The page is ours while it is pulled down: the browser must not scroll it or pull to refresh itself.
    if (e.cancelable) e.preventDefault();
    this.distance.set(pullDistance(dy));
    this.ready.set(dy >= PULL_THRESHOLD);
  };

  private readonly onEnd = () => {
    const go = this.startY !== null && this.raw >= PULL_THRESHOLD;
    this.reset();
    if (go) this.refresh.emit();
  };

  ngOnInit(): void {
    this.el.addEventListener('touchstart', this.onStart, { passive: true });
    this.el.addEventListener('touchmove', this.onMove, { passive: false });
    this.el.addEventListener('touchend', this.onEnd);
    this.el.addEventListener('touchcancel', () => this.reset());
  }

  ngOnDestroy(): void {
    this.el.removeEventListener('touchstart', this.onStart);
    this.el.removeEventListener('touchmove', this.onMove);
    this.el.removeEventListener('touchend', this.onEnd);
  }

  private reset(): void {
    this.startY = null;
    this.raw = 0;
    this.distance.set(0);
    this.ready.set(false);
  }
}
