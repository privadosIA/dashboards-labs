import { isFinished, type Generation } from './model';

/**
 * The generations of `next` that finished since `previous`: `done` or `failed` now, and seen unfinished before. One that
 * `previous` does not hold (the first read of the history, a restored one) is never reported.
 */
export function finished(previous: readonly Generation[], next: readonly Generation[]): Generation[] {
  const before = new Map(previous.map((g) => [g.id, g]));
  return next.filter((g) => {
    const was = before.get(g.id);
    return was !== undefined && !isFinished(was) && isFinished(g);
  });
}
