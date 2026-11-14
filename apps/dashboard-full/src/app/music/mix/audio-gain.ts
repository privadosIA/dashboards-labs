/**
 * Where the browser's audio goes when the studio plays clips itself: one Web
 * Audio context for the page, whose output passes a limiter (the server's mix
 * is limited too, so overlapping loud clips do not clip).
 */
let shared: { ctx: AudioContext; master: AudioNode } | null = null;

function sharedContext(): { ctx: AudioContext; master: AudioNode } | null {
  if (shared) return shared;
  if (typeof AudioContext === 'undefined') return null;
  const ctx = new AudioContext();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  limiter.connect(ctx.destination);
  shared = { ctx, master: limiter };
  return shared;
}

/**
 * The level of one `<audio>` element. A clip's gain goes up to 2, which the
 * element's own volume (0 to 1) cannot do, so the element is routed through a
 * Web Audio gain when the browser allows it (the audio must come from the
 * page's own origin); otherwise the volume is used, capped at 1.
 */
export class GainRoute {
  private node: GainNode | null = null;
  private ctx: AudioContext | null = null;
  private tried = false;

  constructor(private readonly audio: HTMLMediaElement) {}

  /** Call once the element has its source: the decision depends on where it comes from. */
  attach(): void {
    if (this.tried) return;
    this.tried = true;
    try {
      if (new URL(this.audio.src, window.location.href).origin !== window.location.origin) return;
      const s = sharedContext();
      if (!s) return;
      const gain = s.ctx.createGain();
      s.ctx.createMediaElementSource(this.audio).connect(gain).connect(s.master);
      this.node = gain;
      this.ctx = s.ctx;
    } catch {
      this.node = null; // the plain volume is used instead
    }
  }

  /** The browser keeps a context suspended until the user has acted on the page. */
  resume(): void {
    void this.ctx?.resume();
  }

  set(level: number): void {
    const g = Math.max(0, level);
    if (this.node && this.ctx) this.node.gain.setTargetAtTime(g, this.ctx.currentTime, 0.01);
    else this.audio.volume = Math.min(1, g);
  }
}
