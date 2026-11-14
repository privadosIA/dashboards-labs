import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, model, signal, viewChild } from '@angular/core';
import type { SongMap } from '@lab/animation-core';
import { FrameHost, PreviewClock, Transport, type ScenePage } from '@lab/motion-editor';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';

/**
 * The preview in a window of its own, resizable from its right edge (it keeps its aspect, so it grows with its width) and moved by its title bar. It draws the same pages
 * from the same clock as the small preview on the page, so closing it leaves the playhead and the playing state where they were. It closes with
 * the X, Esc or a click on the dark area; the width and the place it was given are kept for the next time.
 */
@Component({
  selector: 'app-preview-modal',
  imports: [FrameHost, Transport],
  templateUrl: './preview-modal.html',
  styleUrl: './preview-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewModal {
  readonly open = model(false);
  readonly pages = input.required<readonly ScenePage[]>();
  readonly clock = input.required<PreviewClock>();
  readonly songMap = input.required<Pick<SongMap, 'beats' | 'beatBase' | 'sections'>>();

  protected readonly t = textsFor(inject(LanguageService).lang).editor;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }

  /** How far the window was moved from the centre, in pixels. */
  protected readonly offset = signal({ x: 0, y: 0 });
  private grabbed: { readonly x: number; readonly y: number; readonly from: { x: number; y: number }; moved: boolean } | null = null;
  private justMoved = false;

  /** Pressing the title bar (not its close button) takes the window; it is dragged until the button is let go. */
  protected grab(event: PointerEvent): void {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // a pointer that cannot be captured still moves the window while it stays over it
    }
    this.grabbed = { x: event.clientX, y: event.clientY, from: this.offset(), moved: false };
  }

  protected carry(event: PointerEvent): void {
    const g = this.grabbed;
    if (!g) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    g.moved = true;
    // The bar always stays on screen: the window cannot be taken further than half the screen from the centre.
    const limit = (size: number): number => Math.floor(size / 2) - 24;
    this.offset.set({ x: Math.max(-limit(window.innerWidth), Math.min(limit(window.innerWidth), g.from.x + dx)), y: Math.max(-limit(window.innerHeight), Math.min(limit(window.innerHeight), g.from.y + dy)) });
  }

  protected drop(): void {
    if (this.grabbed?.moved) {
      // The click that follows letting go over the backdrop is not a click on it.
      this.justMoved = true;
      setTimeout(() => (this.justMoved = false));
    }
    this.grabbed = null;
  }

  /** A click on the backdrop lands on the dialog itself, not on its content. */
  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement && !this.justMoved) this.open.set(false);
  }
}
