import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';

import { gapText } from '../../gap-text';
import { MOTION_EDITOR_LANG } from '../../provide-motion-editor';
import { motionEditorTexts } from '../../texts';
import type { ScenePage } from '../page-source';
import { planFrames, type Slots } from './frame-plan';

/**
 * The canvas of the preview: two sandboxed frames, the scene being shown and the one that comes next, loaded before the cut so that the cut
 * does not flash. Seeking at song time `T` shows the scene that holds `T` and posts `{type: 'seek', t: T - start}` to its frame. The page is
 * laid out at its own size and scaled to fit, keeping the aspect. The frames have no `allow-same-origin`: a fragment cannot reach the dashboard.
 */
@Component({
  selector: 'lab-preview-frame-host',
  templateUrl: './frame-host.html',
  styleUrl: './frame-host.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrameHost {
  /** The pages of the piece, in script order. */
  readonly pages = input.required<readonly ScenePage[]>();
  /** The song time to show, in seconds. */
  readonly time = input.required<number>();

  protected readonly t = motionEditorTexts(inject(MOTION_EDITOR_LANG));
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly frame0 = viewChild.required<ElementRef<HTMLIFrameElement>>('frame0');
  private readonly frame1 = viewChild.required<ElementRef<HTMLIFrameElement>>('frame1');

  protected readonly visible = signal<0 | 1>(0);
  protected readonly current = signal(-1);
  /** The opacity of the frame that is not the current one, while a crossfade runs. */
  protected readonly blend = signal(0);
  protected readonly scale = signal(1);
  protected readonly size = computed(() => {
    const p = this.pages();
    return { width: p[0]?.width ?? 1280, height: p[0]?.height ?? 720 };
  });
  protected readonly badge = computed(() => {
    const page = this.pages()[this.current()];
    return page && page.fidelity === 'approximate' ? { label: this.t.approximate, gaps: page.gaps.map((g) => gapText(this.t, g)) } : null;
  });

  private slots: Slots = [null, null];
  private readonly html: [string | null, string | null] = [null, null];
  private readonly ready: [boolean, boolean] = [false, false];
  private readonly posted: [number, number] = [Number.NaN, Number.NaN];

  constructor() {
    effect(() => {
      const pages = this.pages();
      const time = this.time();
      untracked(() => this.sync(pages, time));
    });
    effect((onCleanup) => {
      const el = this.stage().nativeElement;
      const fit = (): void => this.scale.set(el.clientWidth > 0 ? el.clientWidth / this.size().width : 1);
      fit();
      if (typeof ResizeObserver === 'undefined') return;
      const watcher = new ResizeObserver(fit);
      watcher.observe(el);
      onCleanup(() => watcher.disconnect());
    });
    inject(DestroyRef).onDestroy(() => {
      this.html[0] = this.html[1] = null;
    });
  }

  protected loaded(k: 0 | 1): void {
    // A frame says it loaded the blank page it starts with, before it has been given anything: that is not a page of the piece.
    if (this.html[k] === null) return;
    this.ready[k] = true;
    this.posted[k] = Number.NaN;
    this.sync(this.pages(), this.time());
  }

  private frameOf(k: 0 | 1): HTMLIFrameElement {
    return (k === 0 ? this.frame0() : this.frame1()).nativeElement;
  }

  private sync(pages: readonly ScenePage[], time: number): void {
    const plan = planFrames(pages, time, this.slots);
    this.slots = plan.slots;
    this.visible.set(plan.visible);
    this.blend.set(plan.blend);
    this.current.set(plan.current);
    for (const k of [0, 1] as const) {
      const id = plan.slots[k];
      const page = id === null ? undefined : pages.find((p) => p.id === id);
      const next = page?.html ?? null;
      if (this.html[k] !== next) {
        this.html[k] = next;
        this.ready[k] = false;
        this.posted[k] = Number.NaN;
        this.frameOf(k).srcdoc = next ?? '';
      }
      if (!page || !this.ready[k]) continue;
      const local = k === plan.visible ? plan.local : 0; // the next page shows its first frame while it fades in
      if (this.posted[k] !== local) {
        this.posted[k] = local;
        // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration -- the frames are sandboxed without allow-same-origin: their origin is opaque, '*' is the only target, and the message holds a second
        this.frameOf(k).contentWindow?.postMessage({ type: 'seek', t: local }, '*');
      }
    }
  }
}
