import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';

import { MotionPage } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { AvailabilityStore } from '../../core/availability.store';
import { EnvironmentStore } from '../../core/environment.store';
import { ModelNoticeComponent } from '../../shared/model-notice/model-notice.component';
import { EditorStore } from '../editor.store';
import { windowOptions } from '../../shared/floating-window/floating-window';
import { Timeline, hasTimelineBlock, parseTimeline, writeTimeline } from './motion-timeline';
import { MotionTimelineDialogComponent, TimelineSession } from './motion-timeline-dialog.component';
import { MotionTimelinePanelComponent } from './motion-timeline-panel.component';

/** Clips longer than this many seconds edit their timeline in a window. */
export const LONG_CLIP_SECONDS = 4;

/**
 * The stored page of a motion-graphic scene (or of its overlay): a preview that plays in a sandboxed
 * frame with a time slider and no video rendering, the button to have the model write it again,
 * and the page's text to edit by hand. The controls are disabled, with the reason, when the browser
 * that draws it or the model that writes it is missing.
 */
@Component({
  selector: 'app-motion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatSliderModule, ModelNoticeComponent, MotionTimelinePanelComponent],
  templateUrl: './motion-page.component.html',
  styleUrl: './motion-page.component.scss',
})
export class MotionPageComponent {
  readonly sceneId = input.required<string>();
  /** The page of the scene's overlay instead of the scene's own. */
  readonly overlay = input(false);
  /** The scene has the description (or the overlay text) the page is written from. */
  readonly described = input(false);

  private readonly api = inject(ApiService);
  protected readonly store = inject(EditorStore);
  protected readonly env = inject(EnvironmentStore);
  protected readonly availability = inject(AvailabilityStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly dialog = inject(MatDialog);

  protected readonly page = signal<MotionPage | null>(null);
  protected readonly busy = signal<'' | 'loading' | 'generating' | 'saving'>('');
  protected readonly error = signal('');
  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  /** The page's HTML with the timeline edits not saved yet; null while there are none. */
  protected readonly workingHtml = signal<string | null>(null);
  /** The timeline of the stored page (the same object until the page itself changes). */
  protected readonly timeline = computed(() => parseTimeline(this.page()?.html ?? ''));
  /** The page has a timeline block, usable or not. */
  protected readonly hasBlock = computed(() => hasTimelineBlock(this.page()?.html ?? ''));
  /** A clip longer than this edits its timeline in a window of its own. */
  protected readonly long = computed(() => (this.page()?.duration ?? 0) > LONG_CLIP_SECONDS);
  protected readonly timelineDirty = computed(() => this.workingHtml() !== null && this.workingHtml() !== this.page()?.html);
  protected readonly time = signal(0);
  protected readonly playing = signal(false);
  private timer?: ReturnType<typeof setInterval>;
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  /** The model that writes pages can run now (false while unknown): the generate button is hidden otherwise. */
  protected readonly modelAvailable = computed(() => this.availability.available('motion_graphics'));

  /** The reason the page cannot be written now, or '' when it can. */
  protected readonly blocked = computed(() => {
    const browser = this.env.browser();
    if (browser && !browser.present) {
      return $localize`:@@motion.noBrowser:Chrome or Chromium is needed to draw this page. ${browser.fix ?? ''}:fix:`;
    }
    if (!this.described()) {
      return $localize`:@@motion.noDescription:Write the description first.`;
    }
    if (this.store.dirty()) {
      return $localize`:@@motion.saveFirst:Save the project so the current description is used.`;
    }
    return '';
  });

  /** The preview as the frame takes it: the page is sandboxed and has its own content policy, so it is trusted as a document. */
  protected readonly srcdoc = computed<SafeHtml | null>(() => {
    const preview = this.page()?.preview;
    return preview ? this.sanitizer.bypassSecurityTrustHtml(preview) : null; // NOSONAR: the preview is the page the server drew, shown in a sandboxed iframe with its own content policy
  });

  constructor() {
    void this.env.ensureLoaded();
    void this.availability.load();
    effect(() => {
      const id = this.sceneId();
      const overlay = this.overlay();
      untracked(() => {
        this.stop();
        this.time.set(0);
        this.editing.set(false);
        this.error.set('');
        void this.load(id, overlay);
      });
    });
    effect(() => this.seek(this.time()));
    // A new page (loaded, written, saved) is the new starting point of the timeline edits.
    effect(() => {
      this.page();
      untracked(() => this.workingHtml.set(null));
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private async load(id: string, overlay: boolean): Promise<void> {
    this.page.set(null);
    this.busy.set('loading');
    try {
      const page = await firstValueFrom(this.api.getMotionPage(this.store.projectId(), id, overlay));
      if (id === this.sceneId() && overlay === this.overlay()) this.page.set(page);
    } catch {
      // A scene that is not saved yet has no page to read: nothing to show.
    } finally {
      this.busy.set('');
    }
  }

  protected async generate(): Promise<void> {
    this.busy.set('generating');
    this.error.set('');
    try {
      this.page.set(await firstValueFrom(this.api.generateMotionPage(this.store.projectId(), this.sceneId(), this.overlay())));
      this.editing.set(false);
      this.time.set(0);
    } catch (e) {
      this.error.set(messageOf(e));
    } finally {
      this.busy.set('');
    }
  }

  protected startEditing(): void {
    this.draft.set(this.workingHtml() ?? this.page()?.html ?? '');
    this.editing.set(true);
    this.error.set('');
  }

  protected async saveEdit(): Promise<void> {
    this.busy.set('saving');
    this.error.set('');
    try {
      this.page.set(await firstValueFrom(this.api.saveMotionPage(this.store.projectId(), this.sceneId(), this.draft(), this.overlay())));
      this.editing.set(false);
    } catch (e) {
      this.error.set(messageOf(e));
    } finally {
      this.busy.set('');
    }
  }

  // --- the preview ---------------------------------------------------------

  /** Tells the page in the frame what second it is; it draws that moment and nothing else. */
  protected seek(t: number): void {
    // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration -- the frame is sandboxed without allow-same-origin: its origin is opaque, '*' is the only target, and the message holds a second
    this.frame()?.nativeElement.contentWindow?.postMessage({ type: 'seek', t }, '*');
  }

  protected loaded(): void {
    this.seek(this.time());
    const working = this.workingHtml();
    const tl = working ? parseTimeline(working) : null;
    if (tl) this.previewTimeline(tl);
  }

  /** Shows an edited timeline in the frame without reloading it, at the same second. */
  private previewTimeline(tl: Timeline): void {
    // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration -- opaque origin of the sandboxed frame (see seek); the message is the user's own timeline
    this.frame()?.nativeElement.contentWindow?.postMessage({ type: 'timeline', data: tl }, '*');
  }

  /** The timeline panel changed something: keep the edited page and show it at once. */
  protected timelineChanged(tl: Timeline): void {
    const base = this.workingHtml() ?? this.page()?.html ?? '';
    this.workingHtml.set(writeTimeline(base, tl));
    this.previewTimeline(tl);
  }

  /** Opens the timeline of a long clip in a window that moves, resizes and maximizes. */
  protected openTimeline(): void {
    const session: TimelineSession = {
      page: this.page,
      time: this.time,
      playing: this.playing,
      busy: this.busy,
      timeline: this.timeline,
      workingHtml: this.workingHtml,
      dirty: this.timelineDirty,
      toggle: () => this.toggle(),
      changed: (tl) => this.timelineChanged(tl),
      save: () => this.saveTimeline(),
    };
    this.dialog.open(MotionTimelineDialogComponent, { data: session, ...windowOptions(1200, 'min(90vh, 960px)') });
  }

  /** Stores the page with the edited timeline, like any manual edit of it. */
  protected async saveTimeline(): Promise<void> {
    const html = this.workingHtml();
    if (html === null) return;
    this.busy.set('saving');
    this.error.set('');
    try {
      this.page.set(await firstValueFrom(this.api.saveMotionPage(this.store.projectId(), this.sceneId(), html, this.overlay())));
    } catch (e) {
      this.error.set(messageOf(e));
    } finally {
      this.busy.set('');
    }
  }

  protected setTime(t: number): void {
    this.time.set(t);
  }

  protected toggle(): void {
    if (this.playing()) return this.stop();
    const total = this.page()?.duration ?? 0;
    if (total <= 0) return;
    if (this.time() >= total) this.time.set(0);
    this.playing.set(true);
    const step = 1 / 30;
    this.timer = setInterval(() => {
      const next = this.time() + step;
      if (next >= total) {
        this.time.set(total);
        this.stop();
      } else {
        this.time.set(next);
      }
    }, step * 1000);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.playing.set(false);
  }
}

function messageOf(e: unknown): string {
  const err = e as HttpErrorResponse;
  return err?.error?.error?.message ?? err?.error?.message ?? err?.message ?? $localize`:@@motion.failed:The operation could not be completed.`;
}
