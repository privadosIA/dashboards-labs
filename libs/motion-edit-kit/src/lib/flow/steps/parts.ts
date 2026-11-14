import type { AnimationPort, Draft } from '@lab/animation-core';
import { type Observable, forkJoin, map, of, switchMap, takeWhile, timer } from 'rxjs';

import type { StepEvent } from '../execute';
import type { Plan } from '../model';

export const DRAFT_POLL_MS = 1500;

/** Where a wanted part is: already in the catalog, being written, ready to approve, failed, approved or dropped. */
export type PartStatus = 'there' | 'writing' | 'ready' | 'failed' | 'approved' | 'dropped';

export interface PartItem {
  /** The name the plan wants. */
  name: string;
  request: string;
  status: PartStatus;
  draftId?: string;
  /** The name the part has in the catalog once approved (the server names it). */
  partName?: string;
  /** The addresses of the preview frames, to open with the server's ticket. */
  preview: string[];
  error?: string;
}

/** What the step keeps as its result. */
export interface PartsResult {
  items: PartItem[];
  /** The review already suggested going back to the Script to use the approved parts (once). */
  suggested?: boolean;
}

/** An item as the draft says it is. */
export function itemOf(item: PartItem, draft: Draft): PartItem {
  const status: PartStatus = draft.state === 'writing' ? 'writing' : draft.state === 'ready' ? 'ready' : 'failed';
  const error = draft.error ?? draft.problems[0];
  const { error: _gone, ...rest } = item;
  return { ...rest, draftId: draft.id, status, preview: [...draft.preview], ...(draft.name ? { partName: draft.name } : {}), ...(status === 'failed' && error ? { error } : {}) };
}

/** Asks the assistant for a draft of one part. The model and the provider are for this call only. */
export function askPart(animation: AnimationPort, item: PartItem, model: string, provider = ''): Observable<PartItem> {
  return animation.askDraft({ request: item.request, ...(model ? { model } : {}), ...(provider ? { provider } : {}) }).pipe(map((draft) => itemOf(item, draft)));
}

/** Reads the drafts again every `pollMs` until none is being written; each emission is the items as they are. */
export function followDrafts(animation: AnimationPort, items: PartItem[], pollMs: number = DRAFT_POLL_MS): Observable<PartItem[]> {
  const writing = (list: PartItem[]) => list.some((i) => i.status === 'writing');
  return timer(0, pollMs).pipe(
    switchMap(() => (writing(items) ? forkJoin(items.map((i) => (i.status === 'writing' && i.draftId ? animation.draft(i.draftId).pipe(map((d) => itemOf(i, d))) : of(i)))) : of(items))),
    map((list) => (items = list)),
    takeWhile(writing, true),
  );
}

/**
 * The Parts step: each wanted part the catalog does not have is asked of the assistant and its draft is followed until it is ready or failed. Parts the catalog has are listed
 * as already there. When every draft failed, the step fails with the first reason (Retry, Back or Skip); otherwise the review shows each one.
 */
export function runParts(animation: AnimationPort, plan: Plan, model: string, pollMs: number = DRAFT_POLL_MS, provider = ''): Observable<StepEvent> {
  return animation.catalog().pipe(
    switchMap((catalog) => {
      const there = new Set(catalog.parts.map((p) => p.name));
      const wanted = plan.parts.map<PartItem>((p) => ({ name: p.name, request: p.request, status: there.has(p.name) ? 'there' : 'writing', preview: [] }));
      const toAsk = wanted.filter((i) => i.status === 'writing');
      return (toAsk.length ? forkJoin(toAsk.map((i) => askPart(animation, i, model, provider))) : of([] as PartItem[])).pipe(map((asked) => wanted.map((i) => asked.find((a) => a.name === i.name) ?? i)));
    }),
    switchMap((items) => followDrafts(animation, items, pollMs)),
    map((items): StepEvent => {
      if (items.some((i) => i.status === 'writing')) return { kind: 'progress', info: { items } };
      const asked = items.filter((i) => i.status !== 'there');
      if (asked.length > 0 && asked.every((i) => i.status === 'failed')) throw new Error(asked[0].error ?? 'the drafts failed');
      return { kind: 'done', result: { items } satisfies PartsResult as unknown as Record<string, unknown>, refs: { drafts: Object.fromEntries(items.flatMap((i) => (i.draftId ? [[i.name, i.draftId]] : []))) } };
    }),
  );
}

/** The result with one item replaced. */
export const withItem = (result: PartsResult, item: PartItem): PartsResult => ({ ...result, items: result.items.map((i) => (i.name === item.name ? item : i)) });
