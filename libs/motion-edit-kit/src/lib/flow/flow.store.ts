import { computed, signal } from '@angular/core';

import { FlowStorage } from './flow.storage';
import { type Attempt, type Flow, type Plan, type Refs, type StepId, type StepState, STEP_ORDER, canAutoContinue, newFlow, stepIndex, stepsAfter } from './model';

export interface FlowStoreOptions {
  now?: () => number;
  newId?: () => string;
}

/**
 * The flow that is open, as signals, and the moves a flow makes. Every move writes the flow to the browser's storage. It runs no step: the steps (`steps/`) call
 * it to say what they started, what they got and how it ended.
 */
export class FlowStore {
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly _flow = signal<Flow | undefined>(undefined);
  private readonly _notice = signal<string | undefined>(undefined);

  readonly flow = this._flow.asReadonly();
  /** Said once when keeping a flow dropped older ones, or when the browser would not keep it. */
  readonly notice = this._notice.asReadonly();
  readonly current = computed(() => this._flow()?.current);
  readonly flows = signal<Flow[]>([]);
  /** The switches new flows start with, kept in the browser. */
  readonly defaults = signal<Flow['autoContinue']>({});

  constructor(
    private readonly storage: FlowStorage,
    options: FlowStoreOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.newId = options.newId ?? (() => `flow-${this.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    this.defaults.set(storage.defaults());
    this.refreshList();
  }

  /** Sets or clears a default switch; only the steps that may run on have one. */
  setDefault(step: StepId, on: boolean): boolean {
    if (!canAutoContinue(step)) return false;
    const next = { ...this.defaults(), [step]: on };
    if (!on) delete next[step];
    this.defaults.set(next);
    this.storage.saveDefaults(next);
    return true;
  }

  refreshList(): void {
    this.flows.set(this.storage.list());
  }

  /** Opens a kept flow; `false` when there is none with that id. */
  open(id: string): boolean {
    const flow = this.storage.get(id);
    this._flow.set(flow);
    return flow !== undefined;
  }

  close(): void {
    this._flow.set(undefined);
  }

  /** Starts a flow from a plan: the plan is done and the song is next. */
  start(prompt: string, plan: Plan, auto: Flow['autoContinue'] = {}): Flow {
    const flow = { ...newFlow(this.newId(), this.now(), prompt, plan), autoContinue: { ...auto } };
    this.commit(flow);
    return flow;
  }

  /** A new flow with the plan and the prompt of another, nothing run. */
  startFrom(flow: Flow): Flow {
    return this.start(flow.prompt, structuredClone(flow.plan), flow.autoContinue);
  }

  remove(id: string): void {
    this.storage.remove(id);
    if (this._flow()?.id === id) this._flow.set(undefined);
    this.refreshList();
  }

  /** The step starts: it is running and it is the current one. */
  run(step: StepId): void {
    this.update((f) => {
      f.steps[step] = { status: 'running', startedAt: this.now() };
      f.current = step;
    });
  }

  /**
   * The step finished with a result. It stops for review (`waiting`), unless the person set "do not stop here" on a step that allows it: then it is done and the
   * next one is current and pending. Returns the step that is current now.
   */
  complete(step: StepId, result?: Record<string, unknown>): StepId {
    this.update((f) => {
      f.steps[step] = { ...f.steps[step], status: 'waiting', finishedAt: this.now(), ...(result ? { result } : {}) };
      delete f.steps[step].reason;
      if (canAutoContinue(step) && f.autoContinue[step]) this.advance(f);
    });
    return this.current() as StepId;
  }

  /** The person pressed Continue on the step in review: it is done and the next one is current and pending. */
  continue(): StepId {
    this.update((f) => {
      if (f.steps[f.current].status !== 'waiting') return;
      this.advance(f);
    });
    return this.current() as StepId;
  }

  /** The step failed: it says why and stops there. */
  fail(step: StepId, reason: string): void {
    this.update((f) => {
      f.steps[step] = { ...f.steps[step], status: 'failed', reason, finishedAt: this.now() };
      f.current = step;
    });
  }

  /** Leaves a step out (Parts, after a failure or when the person gives up on it) and goes on. */
  skip(step: StepId): void {
    this.update((f) => {
      f.steps[step] = { status: 'skipped', finishedAt: this.now() };
      if (f.current === step) this.advance(f);
    });
  }

  /**
   * Goes back to a finished step, which is in review again. The later ones are out of date and lose their results, and nothing on the server is deleted. Exceptions:
   * going back to Design keeps the script (out of date, with its result, so the person may keep it or propose it again) and going back to Script keeps the parts.
   * What the later steps made on the server (a piece) is listed as an earlier attempt when it will be made again.
   */
  back(step: StepId): void {
    this.update((f) => {
      if (f.steps[step].status === 'pending' || f.steps[step].status === 'running') return;
      const keep: StepId[] = step === 'design' ? ['script'] : step === 'script' ? ['parts'] : [];
      for (const later of stepsAfter(step)) {
        const state = f.steps[later];
        if (state.status === 'pending' && !keep.includes(later)) continue;
        if (later === 'done') {
          f.steps.done = { status: 'pending' };
        } else if (later === 'parts' && keep.includes('parts')) {
          // the parts stay as they are: the drafts live on the server
        } else if (keep.includes(later)) {
          f.steps[later] = { ...state, status: 'stale', reason: 'design-changed' };
        } else {
          f.steps[later] = { status: 'stale', reason: `back-to-${step}` };
        }
      }
      if (step === 'song' || step === 'map') this.retire(f, 'piece');
      f.steps[step] = { ...f.steps[step], status: 'waiting' };
      delete f.steps[step].reason;
      f.current = step;
    });
  }

  /** Keeps a stale step as it is (the script after going back to Design): it is in review again, with the result it had. */
  keep(step: StepId): void {
    this.update((f) => {
      if (f.steps[step].status !== 'stale' || !f.steps[step].result) return;
      f.steps[step] = { ...f.steps[step], status: 'waiting' };
      delete f.steps[step].reason;
    });
  }

  /** The "do not stop here" switch: only where a pause is safe to skip. Returns whether it was set. */
  setAuto(step: StepId, on: boolean): boolean {
    if (!canAutoContinue(step) || !this._flow()) return false;
    this.update((f) => {
      f.autoContinue = { ...f.autoContinue, [step]: on };
    });
    return true;
  }

  /** Records what the flow made on the server (the song, the piece, a draft): what resuming reads again. */
  setRefs(patch: Partial<Omit<Refs, 'drafts'>> & { drafts?: Record<string, string> }): void {
    this.update((f) => {
      f.refs = { ...f.refs, ...patch, drafts: { ...f.refs.drafts, ...(patch.drafts ?? {}) } };
    });
  }

  /** The song that was current stops being so (Regenerate, Pick another): it stays on the server and is listed on Done. */
  retireSong(): void {
    this.update((f) => this.retire(f, 'song'));
  }

  /** Changes what the plan says (the person edited the texts of the song before Regenerate). */
  setPlan(plan: Plan): void {
    this.update((f) => {
      f.plan = plan;
    });
  }

  /** The step's result changes without the step moving (a transcription, a proposal again). */
  setResult(step: StepId, result: Record<string, unknown>): void {
    this.update((f) => {
      f.steps[step] = { ...f.steps[step], result };
    });
  }

  clearNotice(): void {
    this._notice.set(undefined);
  }

  // ---------------------------------------------------------------- inside

  /** The current step is done and the next one is current; Parts is left out when the plan wants none. */
  private advance(f: Flow): void {
    if (f.steps[f.current].status === 'waiting') f.steps[f.current] = { ...f.steps[f.current], status: 'done' };
    let next: StepId = STEP_ORDER[stepIndex(f.current) + 1] ?? 'done';
    if (next === 'parts' && f.plan.parts.length === 0) {
      f.steps.parts = { status: 'skipped', finishedAt: this.now(), reason: 'no-parts-wanted' };
      next = 'render';
    }
    f.current = next;
    // a stale step that kept its result (the script after the design changed) waits for the person's answer: keep it or make it again
    if (f.steps[next].status === 'failed' || (f.steps[next].status === 'stale' && !f.steps[next].result)) f.steps[next] = { status: 'pending' };
    if (next === 'done') f.steps.done = { status: 'waiting', startedAt: this.now(), finishedAt: this.now() };
  }

  private retire(f: Flow, kind: Attempt['kind']): void {
    const id = kind === 'song' ? f.refs.songId : f.refs.pieceId;
    if (!id) return;
    if (!f.attempts.some((a) => a.kind === kind && a.id === id)) f.attempts = [...f.attempts, { kind, id, at: this.now() }];
    if (kind === 'song') {
      delete f.refs.songId;
      delete f.refs.libraryKey;
    } else {
      delete f.refs.pieceId;
    }
  }

  private update(change: (flow: Flow) => void): void {
    const current = this._flow();
    if (!current) return;
    const next = structuredClone(current);
    change(next);
    this.commit(next);
  }

  private commit(flow: Flow): void {
    const next = { ...flow, updatedAt: this.now() };
    this._flow.set(next);
    const { dropped, failed } = this.storage.save(next);
    if (dropped.length) this._notice.set(`dropped:${dropped.length}`);
    else if (failed) this._notice.set('not-kept');
    this.refreshList();
  }
}

export type { StepState };
