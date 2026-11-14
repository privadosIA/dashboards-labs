import { ChangeDetectionStrategy, Component, ElementRef, Signal, WritableSignal, computed, effect, inject, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { MotionPage } from '../../core/api.models';
import { FloatingWindow } from '../../shared/floating-window/floating-window';
import { Edge } from '../../shared/floating-window/window-rect';
import { Timeline, parseTimeline } from './motion-timeline';
import { MotionTimelinePanelComponent } from './motion-timeline-panel.component';

/** What the page editor shares with the window: its state, and what it does when the user acts there. */
export interface TimelineSession {
  page: Signal<MotionPage | null>;
  /** The preview's second, shared with the editor. */
  time: WritableSignal<number>;
  playing: Signal<boolean>;
  busy: Signal<string>;
  /** The timeline of the stored page. */
  timeline: Signal<Timeline | null>;
  /** The page with the edits not saved yet, or null. */
  workingHtml: Signal<string | null>;
  dirty: Signal<boolean>;
  toggle(): void;
  changed(tl: Timeline): void;
  save(): Promise<void>;
}

/**
 * The timeline of a long clip in a window: the preview, its player and the timeline panel, with room to
 * work. It moves by its title bar, resizes from any side or corner and maximizes, like the mixer. The
 * state stays in the page editor that opened it; closing the window loses nothing.
 */
@Component({
  selector: 'app-motion-timeline-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatSliderModule, MotionTimelinePanelComponent],
  templateUrl: './motion-timeline-dialog.component.html',
  styleUrl: './motion-timeline-dialog.component.scss',
})
export class MotionTimelineDialogComponent {
  protected readonly session = inject<TimelineSession>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<MotionTimelineDialogComponent>);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly win = new FloatingWindow(this.ref, this.host);
  protected readonly edges = this.win.edges;
  protected readonly maximized = this.win.maximized;
  protected readonly maximizeLabel = $localize`:@@mix.maximize:Maximize`;
  protected readonly restoreLabel = $localize`:@@mix.restore:Restore size`;

  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  protected readonly srcdoc = computed<SafeHtml | null>(() => {
    const preview = this.session.page()?.preview;
    return preview ? this.sanitizer.bypassSecurityTrustHtml(preview) : null; // NOSONAR: the preview is the page the server drew, shown in a sandboxed iframe with its own content policy
  });

  constructor() {
    effect(() => this.post({ type: 'seek', t: this.session.time() }));
    effect(() => {
      const working = this.session.workingHtml();
      const tl = working ? parseTimeline(working) : null;
      if (tl) untracked(() => this.post({ type: 'timeline', data: tl }));
    });
    // Closes by itself if the page goes away (another scene was selected, or it was removed).
    effect(() => {
      if (!this.session.page()?.exists) this.ref.close();
    });
  }

  private post(message: unknown): void {
    // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration -- opaque origin of the sandboxed frame: '*' is the only possible target
    this.frame()?.nativeElement.contentWindow?.postMessage(message, '*');
  }

  protected loaded(): void {
    this.post({ type: 'seek', t: this.session.time() });
    const working = this.session.workingHtml();
    const tl = working ? parseTimeline(working) : null;
    if (tl) this.post({ type: 'timeline', data: tl });
  }

  protected toggleMaximize(): void {
    this.win.toggleMaximize();
  }

  protected startResize(ev: PointerEvent, edge: Edge): void {
    this.win.startResize(ev, edge);
  }

  protected startMove(ev: PointerEvent): void {
    this.win.startMove(ev);
  }

  protected setTime(t: number): void {
    this.session.time.set(t);
  }
}
