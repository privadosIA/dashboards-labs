/** Whether a card can be chosen now: `ready`; `stopped` (a local service that can be started); `starting`; `unavailable` (with its reason). */
export type EngineState = 'ready' | 'stopped' | 'starting' | 'unavailable';

/** Where a time shown on a card comes from, so the panel can name it. */
export type TimeSource = 'server' | 'history' | 'catalog' | 'none';

export interface EngineCard {
  readonly id: string;
  readonly name: string;
  readonly state: EngineState;
  /** The server's reason when it is not ready (`no_gpu`, `not_running`, `no_consent`…, or its own words). */
  readonly reason?: string;
  readonly description?: string;
  /** Whether the engine writes the sound (video). */
  readonly audio?: boolean;
  readonly clipSeconds?: number;
  /** Seconds a generation takes at best quality (video), or a picture (images). */
  readonly seconds?: number;
  readonly source: TimeSource;
  /** What a catalog time is about (the size and steps it was timed at), or whether it was measured. */
  readonly sourceNote?: string;
  /** Whether a catalog time was measured on a real machine (else it is an estimate). */
  readonly measured?: boolean;
  /** The catalog's style tags of a model (`photo`, `general`, `anime`) and its rank among them: what a look is matched on. */
  readonly styles?: readonly string[];
  readonly rank?: number;
  /** The engine the server lists first among the available ones: the one preselected. */
  readonly isDefault?: boolean;
}

/** The Engines panel of a kind, as the server answered it at the moment. */
export type EnginesView =
  | { readonly kind: 'music'; readonly cards: readonly EngineCard[] }
  | { readonly kind: 'video'; readonly cards: readonly EngineCard[] }
  | { readonly kind: 'images'; readonly cards: readonly EngineCard[] }
  | { readonly kind: 'graphics'; readonly chrome: boolean; readonly parts: number }
  | { readonly kind: 'piece'; readonly styles: readonly string[]; readonly levels: readonly string[]; readonly frameRates: readonly number[]; readonly features: readonly string[] };

/** The card to preselect: the one the server marks as default when it can be used, else the first that can. */
export function preselected(cards: readonly EngineCard[]): string {
  const usable = cards.filter((c) => c.state === 'ready');
  return (usable.find((c) => c.isDefault) ?? usable[0])?.id ?? '';
}
