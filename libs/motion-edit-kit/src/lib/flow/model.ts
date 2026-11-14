import type { Choices } from '@lab/animation-core';
import type { GeneratorName } from '@lab/music-studio-kit';

/** The steps of a flow, in the order they run. `plan` is the card before Start; `done` is the last card. */
export const STEP_ORDER = ['plan', 'song', 'map', 'design', 'script', 'parts', 'render', 'done'] as const;
export type StepId = (typeof STEP_ORDER)[number];

/** The steps that may run on without stopping: the ones that are cheap to redo. Song (money and minutes), Script (the whole point) and Render (the expensive one) always stop. */
export const AUTO_STEPS = ['map', 'design', 'parts'] as const;
export type AutoStep = (typeof AUTO_STEPS)[number];
export const canAutoContinue = (step: StepId): step is AutoStep => (AUTO_STEPS as readonly StepId[]).includes(step);

/** Where a step is: waiting to run, running, finished and in review (`waiting`), continued past (`done`), failed, left out, or out of date after going back. */
export type StepStatus = 'pending' | 'running' | 'waiting' | 'done' | 'failed' | 'skipped' | 'stale';

export interface StepState {
  status: StepStatus;
  /** Milliseconds since the epoch. */
  startedAt?: number;
  finishedAt?: number;
  /** Why it failed, or why it is out of date. */
  reason?: string;
  /** What the step answered (plain data, so it can be kept as JSON): what the card shows again after a reload. */
  result?: Record<string, unknown>;
}

/** The assistant that writes for the whole run: a saved provider (empty: the server's routing) and a model of it (empty: the provider's own). Sent with every assistant call; never written to the routing. */
export type { Assistant } from '@lab/assist-kit';

/** What the person decides before Start. */
export interface Plan {
  song: { title: string; lyrics: string; style: string; generator: GeneratorName; instrumental: boolean; /** The length in seconds the sentence named; absent: the studio's default. */ seconds?: number; provider?: string; model?: string };
  animation: { choices: Choices; model?: string; provider?: string };
  /** The parts the piece should have: a name and a line saying what it does. */
  parts: { name: string; request: string }[];
}

/** The things the flow made on the server, by id: what resuming reads again. */
export interface Refs {
  /** The music project of the song being used (the studio's song id). */
  songId?: string;
  /** The key of that song in the animation library. */
  libraryKey?: string;
  pieceId?: string;
  /** The drafts asked for, by the name of the part they are for. */
  drafts: Record<string, string>;
}

/** A song or a piece that stopped being the current one: it stays on the server, listed on Done. */
export interface Attempt {
  kind: 'song' | 'piece';
  id: string;
  title?: string;
  at: number;
}

export interface Flow {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** The sentence the plan was made from. */
  prompt: string;
  plan: Plan;
  steps: Record<StepId, StepState>;
  current: StepId;
  autoContinue: Partial<Record<AutoStep, boolean>>;
  refs: Refs;
  attempts: Attempt[];
}

/** The most flows kept in the browser. */
export const MAX_FLOWS = 20;

export const stepIndex = (step: StepId): number => STEP_ORDER.indexOf(step);
export const stepsAfter = (step: StepId): readonly StepId[] => STEP_ORDER.slice(stepIndex(step) + 1);

/** A flow just started: the plan is done and the song is next. */
export function newFlow(id: string, now: number, prompt: string, plan: Plan): Flow {
  const steps = Object.fromEntries(STEP_ORDER.map((s) => [s, { status: 'pending' } as StepState])) as Record<StepId, StepState>;
  steps.plan = { status: 'done', finishedAt: now };
  return { id, createdAt: now, updatedAt: now, prompt, plan, steps, current: 'song', autoContinue: {}, refs: { drafts: {} }, attempts: [] };
}
