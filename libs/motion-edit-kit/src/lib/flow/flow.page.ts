import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { CdkPortalOutlet } from '@angular/cdk/portal';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ASSIST_SLOTS, AssistSlots } from '@lab/assist-kit';
import { ANIMATION } from '@lab/music-motion';
import { SONGS } from '@lab/music-studio-kit';

import { LanguageService } from '../core/language';
import { MOTION_EDIT_BASE, MOTION_EDIT_OPTIONS } from '../core/options';
import { textsFor } from '../core/texts';
import { FlowList } from './flow-list/flow-list';
import { FlowStorage } from './flow.storage';
import { FlowStore } from './flow.store';
import { type Flow, STEP_ORDER, type StepId, stepIndex } from './model';
import { PlanCard, type PlanStart } from './plan-card/plan-card';
import { resumeFlow } from './resume';
import { reasonText } from './shared/reason-text';
import { DesignCard } from './step-cards/design-card/design-card';
import { DoneCard } from './step-cards/done-card/done-card';
import { MapCard } from './step-cards/map-card/map-card';
import { PartsCard } from './step-cards/parts-card/parts-card';
import { RenderCard } from './step-cards/render-card/render-card';
import { ScriptCard } from './step-cards/script-card/script-card';
import { SongCard } from './step-cards/song-card/song-card';
import type { PartsResult } from './steps/parts';
import type { ProposalSummary } from './steps/propose';

/** The browser's storage, or nothing when it is blocked: the flow then lives in the tab only. */
const browserStorage = (): Pick<Storage, 'getItem' | 'setItem'> | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

/**
 * The Flow page. At `flow` it lists the kept flows and starts a new one from a sentence; at `flow/:id` it shows one flow as a vertical list of step cards: the finished ones
 * collapsed to a line with a way back, the current one open, the rest waiting. Opening a flow first reads from the server where each thing is, so what was running when the tab
 * closed is shown as it really is.
 */
@Component({
  selector: 'app-flow-page',
  imports: [CdkPortalOutlet, DesignCard, DoneCard, FlowList, MapCard, PartsCard, PlanCard, RenderCard, RouterLink, ScriptCard, SongCard],
  providers: [
    { provide: ASSIST_SLOTS, useFactory: () => new AssistSlots() },
    { provide: FlowStorage, useFactory: () => new FlowStorage(inject(MOTION_EDIT_OPTIONS).client ?? 'motion-edit', browserStorage()) },
    { provide: FlowStore, useFactory: () => new FlowStore(inject(FlowStorage)) },
  ],
  templateUrl: './flow.page.html',
  styleUrl: './flow.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'motion-edit-kit' },
})
export class FlowPage {
  private readonly store = inject(FlowStore);
  protected readonly slots = inject(ASSIST_SLOTS);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly base = inject(MOTION_EDIT_BASE);
  private readonly songs = inject(SONGS);
  private readonly animation = inject(ANIMATION);
  private readonly destroyed = inject(DestroyRef);
  private readonly lang = inject(LanguageService).lang;
  private readonly texts = textsFor(this.lang);
  protected readonly t = this.texts.flow;
  protected readonly p = this.t.page;
  protected readonly list = `${this.base}/flow`;
  protected readonly pieces = `${this.base}/pieces`;
  protected readonly steps = STEP_ORDER.filter((s) => s !== 'plan');

  private readonly params = toSignal(this.route.paramMap);
  private readonly query = toSignal(this.route.queryParamMap);
  protected readonly id = computed(() => this.params()?.get('id') ?? null);
  protected readonly flow = this.store.flow;
  protected readonly notice = this.store.notice;
  protected readonly missing = signal(false);
  protected readonly resuming = signal(false);
  protected readonly current = computed<StepId | undefined>(() => this.flow()?.current);
  protected readonly failed = computed(() => (this.flow() && this.flow()!.steps[this.flow()!.current].status === 'failed' ? this.flow()!.current : null));
  /** The step before the failed one that can be gone back to. */
  protected readonly before = computed<StepId | null>(() => {
    const f = this.flow();
    const failed = this.failed();
    if (!f || !failed) return null;
    const earlier = STEP_ORDER.slice(1, stepIndex(failed)).reverse();
    return earlier.find((s) => f.steps[s].status === 'done' || f.steps[s].status === 'waiting') ?? null;
  });

  private opened: string | null = null;

  constructor() {
    effect(() => {
      const id = this.id();
      if (id === this.opened) return;
      this.opened = id;
      if (id) this.open(id);
      else {
        this.store.close();
        this.missing.set(false);
      }
    });
  }

  /** Opens the flow, reads from the server where each thing is, and acts on `?continue=` (the editor's Flow bar asks the flow to go on from the step it was on). */
  private open(id: string): void {
    this.missing.set(false);
    if (!this.store.open(id)) {
      this.missing.set(true);
      return;
    }
    this.resuming.set(true);
    resumeFlow(this.store, { songs: this.songs, animation: this.animation })
      .pipe(takeUntilDestroyed(this.destroyed))
      .subscribe({
        next: () => undefined,
        error: () => this.resuming.set(false),
        complete: () => {
          this.resuming.set(false);
          this.goOn();
        },
      });
  }

  private goOn(): void {
    const step = this.query()?.get('continue');
    const flow = this.store.flow();
    if (!step || !flow) return;
    if (flow.current === step && flow.steps[flow.current].status === 'waiting') this.store.continue();
    void this.router.navigate([this.list, flow.id], { replaceUrl: true });
  }

  /** Start on the plan card: the flow is made with the switches kept by default, and its page opens. */
  protected start(start: PlanStart): void {
    const flow = this.store.start(start.prompt, start.plan, this.store.defaults());
    void this.router.navigate([this.list, flow.id]);
  }

  protected status(step: StepId) {
    return this.flow()?.steps[step].status ?? 'pending';
  }

  protected back(step: StepId): void {
    this.store.back(step);
  }

  protected why(reason: string | undefined): string {
    return reasonText(this.lang, reason);
  }

  /** The one-line summary of a step that is not open. */
  protected line(step: StepId, flow: Flow): string {
    const state = flow.steps[step];
    // only a step that was finished has a summary: a pending or out-of-date one says nothing yet
    if (state.status !== 'done' && state.status !== 'skipped' && state.status !== 'waiting') return '';
    if (state.status === 'skipped') return this.p.line.skipped;
    const r = (state.result ?? {}) as Record<string, unknown>;
    switch (step) {
      case 'song':
        return r['title'] ? this.p.line.song(String(r['title']), Number(r['seconds'] ?? 0)) : '';
      case 'map':
        return r['seconds'] ? this.p.line.map(Math.round(Number(r['seconds'])), Number(r['bpm'] ?? 0)) : '';
      case 'design':
      case 'script': {
        const s = r as unknown as ProposalSummary;
        if (!s.source) return '';
        const author = s.source === 'assistant' ? this.p.author.assistant : this.p.author.rule;
        return step === 'design' ? this.p.line.design(author) : this.p.line.script(author);
      }
      case 'parts':
        return this.p.line.parts(((r as unknown as PartsResult).items ?? []).length);
      case 'render':
        return this.p.line.render;
      default:
        return '';
    }
  }

  /** Whether a step can be gone back to: it has begun and finished (or is out of date with something to show). */
  protected canGoBack(step: StepId): boolean {
    const s = this.status(step);
    return (s === 'done' || s === 'skipped') && step !== 'done' && !(step === 'parts' && s === 'skipped');
  }

  protected noticeText(): string {
    const n = this.notice();
    if (!n) return '';
    return n.startsWith('dropped:') ? this.p.notice.dropped(Number(n.slice(8))) : this.p.notice.notKept;
  }

  protected clearNotice(): void {
    this.store.clearNotice();
  }
}
