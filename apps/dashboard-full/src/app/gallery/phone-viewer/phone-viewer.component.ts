import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { pushBackEntry } from '../../core/back-entry';
import { ShareService } from '../../core/share.service';
import { ThemeService } from '../../core/theme.service';
import { GestureHandlers, SwipeDirection, clampPan, clampScale } from '../../shared/gestures/gestures';
import { GesturesDirective } from '../../shared/gestures/gestures.directive';
import { LightboxData } from '../gallery-lightbox/gallery-lightbox.component';

const DOUBLE_TAP_SCALE = 2.5;

/**
 * The picture viewer of a phone: the image fills the screen; swipe sideways for the next, pinch or double tap to
 * zoom (a finger then pans), swipe down to close. Every gesture has a button as well. The device's back gesture
 * closes it. Reduced motion drops the animations.
 */
@Component({
  selector: 'app-phone-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, GesturesDirective],
  templateUrl: './phone-viewer.component.html',
  styleUrl: './phone-viewer.component.scss',
})
export class PhoneViewerComponent implements OnDestroy {
  protected readonly data = inject<LightboxData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PhoneViewerComponent>>(MatDialogRef);
  protected readonly sharer = inject(ShareService);
  protected readonly theme = inject(ThemeService);

  protected readonly index = signal(this.data.index);
  protected readonly img = computed(() => this.data.images[this.index()]);
  protected readonly url = computed(() => this.data.urlOf(this.img()));
  protected readonly scale = signal(1);
  protected readonly tx = signal(0);
  protected readonly ty = signal(0);
  protected readonly info = signal(false);
  protected readonly zoomed = computed(() => this.scale() > 1);
  protected readonly transform = computed(() => `translate(${this.tx()}px, ${this.ty()}px) scale(${this.scale()})`);

  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');
  private pinchBase: number | null = null;
  private readonly entry = pushBackEntry(() => this.ref.close());

  /** Read by the gesture directive when a finger moves: a zoomed picture is panned, not swiped. */
  protected readonly canPan = () => this.zoomed();

  protected readonly handlers: GestureHandlers = {
    swipe: (d) => this.swiped(d),
    doubleTap: (x, y) => this.toggleZoom(x, y),
    pinch: (factor) => {
      this.pinchBase ??= this.scale();
      this.scale.set(clampScale(this.pinchBase * factor));
      this.keepInside();
    },
    pinchEnd: () => {
      this.pinchBase = null;
      if (this.scale() < 1.05) this.resetZoom();
      this.keepInside();
    },
    pan: (dx, dy) => {
      this.tx.update((v) => v + dx);
      this.ty.update((v) => v + dy);
      this.keepInside();
    },
  };

  constructor() {
    this.ref.afterClosed().subscribe(() => this.entry.leave());
  }

  ngOnDestroy(): void {
    this.entry.leave();
  }

  protected next(): void {
    this.go(this.index() + 1);
  }

  protected prev(): void {
    this.go(this.index() - 1);
  }

  protected close(): void {
    this.ref.close();
  }

  protected zoomIn(): void {
    this.scale.set(clampScale(this.scale() * 1.6));
    this.keepInside();
  }

  protected zoomOut(): void {
    this.scale.set(clampScale(this.scale() / 1.6));
    if (this.scale() < 1.05) this.resetZoom();
    this.keepInside();
  }

  private go(i: number): void {
    const n = Math.min(Math.max(i, 0), this.data.images.length - 1);
    if (n === this.index()) return;
    this.index.set(n);
    this.resetZoom();
  }

  private swiped(d: SwipeDirection): void {
    if (this.zoomed()) return;
    if (d === 'left') this.next();
    else if (d === 'right') this.prev();
    else if (d === 'down') this.close();
  }

  private toggleZoom(x: number, y: number): void {
    if (this.zoomed()) {
      this.resetZoom();
      return;
    }
    // Zoom around the tap: the point under the finger stays where it is.
    const r = this.frame().nativeElement.getBoundingClientRect();
    this.scale.set(DOUBLE_TAP_SCALE);
    this.tx.set(-(x - (r.left + r.width / 2)) * (DOUBLE_TAP_SCALE - 1));
    this.ty.set(-(y - (r.top + r.height / 2)) * (DOUBLE_TAP_SCALE - 1));
    this.keepInside();
  }

  private resetZoom(): void {
    this.scale.set(1);
    this.tx.set(0);
    this.ty.set(0);
  }

  private keepInside(): void {
    const r = this.frame().nativeElement.getBoundingClientRect();
    this.tx.set(clampPan(this.tx(), r.width, this.scale()));
    this.ty.set(clampPan(this.ty(), r.height, this.scale()));
  }
}
