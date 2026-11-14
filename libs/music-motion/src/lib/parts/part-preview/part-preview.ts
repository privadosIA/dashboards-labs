import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, input, signal, viewChild } from '@angular/core';

import { LanguageService } from '../../core/language';
import { textsFor } from '../../core/texts';
import { PartPageError, buildPartPage, type PartLook } from './part-page';

/**
 * Plays the text of a part as it moves, from the two texts given (saved or not), in a sandboxed frame with no access to the dashboard and nothing
 * loaded from outside. It is an approximation: only the visual part, on a looping clock and a steady beat, with no song. It is built when the
 * button is pressed, not at every key, because a fragment runs code.
 */
@Component({
  selector: 'app-part-preview',
  templateUrl: './part-preview.html',
  styleUrl: './part-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartPreview {
  readonly manifest = input.required<string>();
  readonly fragment = input.required<string>();

  private readonly texts = textsFor(inject(LanguageService).lang);
  protected readonly t = this.texts.parts;
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  /** The document the frame plays; a new object at every press, so that pressing again plays it from the start. */
  private readonly doc = signal<{ readonly html: string } | null>(null);
  /** Whether a frame is showing a preview. */
  protected readonly shown = computed(() => this.doc() !== null);
  protected readonly playing = signal(true);
  /** Why it could not be played, or what the part's own script reported. */
  protected readonly problem = signal('');

  constructor() {
    // The document is set on the frame directly because Angular would strip the scripts of a bound `srcdoc`; the frame exists once `shown` is on.
    effect(() => {
      const el = this.frame()?.nativeElement;
      const doc = this.doc();
      if (el && doc) el.srcdoc = doc.html;
    });
  }

  /** The look comes from the page's tokens as they are now, so the part is seen in the colours of the dashboard. */
  private look(): PartLook {
    const style = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
    return { bg: token('--lab-bg', 'Canvas'), fg: token('--lab-ink', 'CanvasText'), accent: token('--lab-accent', 'Highlight'), display: token('--lab-font', 'sans-serif'), body: token('--lab-font', 'sans-serif') };
  }

  protected preview(): void {
    this.problem.set('');
    let page: string;
    try {
      page = buildPartPage(this.manifest(), this.fragment(), this.look());
    } catch (e) {
      this.doc.set(null);
      this.problem.set(e instanceof PartPageError ? e.message : String(e));
      return;
    }
    this.playing.set(true);
    this.doc.set({ html: page });
  }

  protected toggle(): void {
    const frame = this.frame()?.nativeElement;
    if (!frame) return;
    const playing = !this.playing();
    this.playing.set(playing);
    // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration -- the frame is sandboxed without allow-same-origin: its origin is opaque, '*' is the only target, and the message is play or pause
    frame.contentWindow?.postMessage({ type: playing ? 'play' : 'pause' }, '*');
  }

  /** What the part's own script says when it fails, shown under the frame. */
  @HostListener('window:message', ['$event'])
  protected onMessage(event: MessageEvent): void {
    const data = event.data as { type?: unknown; message?: unknown } | null;
    if (event.source !== this.frame()?.nativeElement.contentWindow || data?.type !== 'part-error') return;
    this.problem.set(String(data.message ?? ''));
  }
}
