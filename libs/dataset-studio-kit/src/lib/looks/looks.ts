import type { EngineCard } from '../engines/model';

export type LookId = 'realistic' | 'illustration';

/** A look is style words plus the kind of model that suits them: nothing more, and nothing hidden. */
export interface Look {
  readonly id: LookId;
  /** The words appended to the brief (English: the image prompts are). */
  readonly words: string;
  /** The catalog's style tag of a model that suits the look. */
  readonly style: string;
  /** What the catalog's name or description says when a server's catalog carries no style tags (the fallback). */
  readonly suits: RegExp;
}

export const LOOKS: readonly Look[] = [
  { id: 'realistic', words: 'photorealistic, natural light, 35mm photo, sharp focus, fine detail', style: 'photo', suits: /foto-?realis|photo-?realis|realist/i },
  { id: 'illustration', words: 'digital illustration, painterly, clean line art, vivid colours, stylised', style: 'anime', suits: /ilustr|illustr|anime|cartoon|dibujo|paint|pintur/i },
];

export const lookOf = (id: LookId): Look => LOOKS.find((l) => l.id === id) ?? LOOKS[0];

/** A line starting with `style:` is not a scene: its words style every scene (the look writes one, and a person can write their own). */
export const isStyleLine = (line: string): boolean => /^\s*style\s*:/i.test(line);

/** The style words of the brief's `style:` lines, joined, empty when there are none. */
export function styleWordsOf(brief: string): string {
  return brief
    .split('\n')
    .filter(isStyleLine)
    .map((l) => l.replace(/^\s*style\s*:\s*/i, '').trim())
    .filter(Boolean)
    .join(', ');
}

/** The lines of the brief that are scenes: not empty and not a style line. */
export const sceneLines = (brief: string): string[] => brief.split('\n').filter((l) => l.trim() && !isStyleLine(l));

const kitLine = (look: Look): string => `style: ${look.words}`;

/** The brief with a look's words as a last `style:` line, visibly; the kit's own line of another look is replaced, the person's own lines are never touched. `''` takes the kit's line away. */
export function applyLook(brief: string, look: LookId | ''): string {
  const kept = brief.split('\n').filter((l) => !LOOKS.some((x) => l.trim() === kitLine(x)));
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  if (!look) return kept.join('\n');
  return [...kept, kitLine(lookOf(look))].join('\n');
}

/** The look whose line the brief carries, if it does (so the select shows what the text says). */
export function lookInBrief(brief: string): LookId | '' {
  return LOOKS.find((l) => brief.split('\n').some((x) => x.trim() === kitLine(l)))?.id ?? '';
}

/**
 * The installed model that suits a look: the ready one the catalog tags with the look's style, the best ranked first; when no model carries style tags (a catalog that has none), the first ready one whose name or
 * description says so.
 */
export function recommendedModel(look: LookId, cards: readonly EngineCard[]): EngineCard | undefined {
  const l = lookOf(look);
  const ready = cards.filter((c) => c.state === 'ready');
  const tagged = ready.filter((c) => c.styles?.includes(l.style)).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  if (tagged.length) return tagged[0];
  if (ready.some((c) => c.styles?.length)) return undefined;
  return ready.find((c) => l.suits.test(`${c.name} ${c.description ?? ''}`));
}
