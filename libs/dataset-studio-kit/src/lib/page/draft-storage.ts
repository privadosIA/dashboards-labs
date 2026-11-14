import { InjectionToken } from '@angular/core';

import type { KindId } from '../kinds/kinds';
import type { LookId } from '../looks/looks';

/** The brief in progress, kept in the browser and offered on return. */
export type StudioStep = 'brief' | 'presets' | 'generate' | 'result';
export const STUDIO_STEPS: readonly StudioStep[] = ['brief', 'presets', 'generate', 'result'];

export interface Draft {
  readonly kind: KindId;
  readonly brief: string;
  readonly negative: string;
  readonly look: LookId | '';
  /** The dataset of each kind, as text. */
  readonly raws: Partial<Record<KindId, string>>;
  /** The step it was left on; a draft from before the steps has none and opens on the brief. */
  readonly step?: StudioStep;
}

export const DRAFT_KEY = 'dataset-studio.draft';

/** What the browser's storage is asked for: `localStorage`, or a stand-in in a spec. It may refuse (a private window, blocked data), and then nothing is kept and nothing is reported. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): DraftStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** Whether a draft holds nothing worth offering back. */
export const isEmptyDraft = (d: Draft): boolean => !d.brief.trim() && !d.negative.trim() && Object.values(d.raws).every((r) => !r?.trim());

/** The storage the draft is kept in: the browser's, unless a host or a spec gives another (or `null`: nothing is kept). */
export const DRAFT_STORAGE = new InjectionToken<DraftStorage | null>('DRAFT_STORAGE', { providedIn: 'root', factory: defaultStorage });

export function readDraft(storage: DraftStorage | null = defaultStorage()): Draft | null {
  try {
    const text = storage?.getItem(DRAFT_KEY);
    if (!text) return null;
    const d = JSON.parse(text) as Partial<Draft>;
    if (typeof d.kind !== 'string' || typeof d.brief !== 'string') return null;
    return { kind: d.kind, brief: d.brief, negative: typeof d.negative === 'string' ? d.negative : '', look: d.look === 'realistic' || d.look === 'illustration' ? d.look : '', raws: typeof d.raws === 'object' && d.raws ? d.raws : {}, ...(STUDIO_STEPS.includes(d.step as StudioStep) ? { step: d.step as StudioStep } : {}) };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft, storage: DraftStorage | null = defaultStorage()): void {
  try {
    if (isEmptyDraft(draft)) storage?.removeItem(DRAFT_KEY);
    else storage?.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* the browser refused: the studio works without it */
  }
}

export function clearDraft(storage: DraftStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to do */
  }
}
