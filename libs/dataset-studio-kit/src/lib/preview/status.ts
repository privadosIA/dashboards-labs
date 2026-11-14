import type { AnimationDataset, ImportPlan } from '@lab/animation-dataset';

/** What the preview knows about the dataset now, for the actions beside it. */
export interface PreviewStatus {
  /** The file reads (and, for the animated piece, passes the validator) and the server has answered. */
  readonly valid: boolean;
  /** The server is still reading it. */
  readonly busy: boolean;
  readonly entries: number;
  readonly imported: number;
  readonly rejected: number;
  /** The project file the server wrote from the dataset: what Create confirms. */
  readonly yaml: string;
  /** The animated piece and what importing it would do. */
  readonly dataset: AnimationDataset | null;
  readonly plan: ImportPlan | null;
  /** Why it is not valid, in words. */
  readonly problem: string;
}

export const NO_STATUS: PreviewStatus = { valid: false, busy: false, entries: 0, imported: 0, rejected: 0, yaml: '', dataset: null, plan: null, problem: '' };
