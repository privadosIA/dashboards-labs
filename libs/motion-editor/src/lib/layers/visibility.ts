import type { Script } from '@lab/animation-core';

/** The parts to leave out of the preview: when one is soloed, every other part of the script; plus the ones hidden by hand. */
export function hiddenParts(script: Script, solo: string | null, hidden: ReadonlySet<string>): ReadonlySet<string> {
  const out = new Set(hidden);
  if (solo !== null) {
    for (const p of script.pieces) {
      for (const name of [p.part, ...(p.with ?? []).map((w) => w.part)]) if (name !== solo) out.add(name);
    }
  }
  if (solo !== null) out.delete(solo);
  return out;
}
