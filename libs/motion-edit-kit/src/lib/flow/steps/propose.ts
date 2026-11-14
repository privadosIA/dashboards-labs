import type { AnimationPort, Proposal } from '@lab/animation-core';
import { type Observable, map } from 'rxjs';

import type { StepEvent } from '../execute';

/** What the review of a proposal shows. Plain data, so the flow keeps it as the step's result. */
export interface ProposalSummary {
  what: 'design' | 'script';
  /** `fallback` means the fixed rule wrote it, which is not an error. */
  source: 'assistant' | 'fallback';
  fallbackReason?: string;
  model?: string;
  /** What was sent: the prompt and the model asked for (empty: the server's own). */
  prompt: string;
  askedModel: string;
  /** The provider asked for (empty: the server's routing). */
  askedProvider: string;
  replacements: number;
  design?: { accent: string; dark: string; light: string; display: string; body: string; concept: string };
  script?: { pieces: number; lines: number };
}

export function summaryOf(proposal: Proposal, prompt: string, askedModel: string, askedProvider = ''): ProposalSummary {
  const p = proposal.piece;
  return {
    what: proposal.what === 'script' ? 'script' : 'design',
    source: proposal.source,
    ...(proposal.fallbackReason ? { fallbackReason: proposal.fallbackReason } : {}),
    ...(proposal.model ? { model: proposal.model } : {}),
    prompt,
    askedModel,
    askedProvider,
    replacements: proposal.replacements.length,
    ...(proposal.what === 'design'
      ? { design: { accent: p.design.design.accent, dark: p.design.design.dark, light: p.design.design.light, display: p.design.design.display, body: p.design.design.body, concept: p.design.design.concept } }
      : { script: { pieces: p.script.pieces.length, lines: p.script.pieces.reduce((n, piece) => n + (piece.lines?.length ?? 0), 0) } }),
  };
}

/** Asks the assistant to write the design or the script of the piece: it answers when it is written. The prompt, the model and the provider are for this call only. */
export function propose(animation: AnimationPort, pieceId: string, what: 'design' | 'script', prompt: string, model: string, provider = ''): Observable<StepEvent> {
  return animation.propose(pieceId, { what, ...(prompt ? { prompt } : {}), ...(model ? { model } : {}), ...(provider ? { provider } : {}) }).pipe(map((proposal): StepEvent => ({ kind: 'done', result: { ...summaryOf(proposal, prompt, model, provider) } })));
}
