/** Number formatting and scale helpers shared by the SVG charts. */
import { activeLang } from '../../core/language';

const NF = (digits: number) => new Intl.NumberFormat(activeLang(), { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function fmtNumber(n: number, digits = 0): string {
  return NF(digits).format(n);
}

export function fmtPct(n: number, digits = 0): string {
  return activeLang() === 'en' ? `${fmtNumber(n, digits)}%` : `${fmtNumber(n, digits)} %`;
}

/** Seconds as the shortest readable duration: `12 s`, `3 min 05 s`, `1 h 02 min`. */
export function fmtSeconds(s: number): string {
  if (!Number.isFinite(s)) return '—';
  if (s < 60) return `${fmtNumber(s, s < 10 && s % 1 !== 0 ? 1 : 0)} s`;
  const total = Math.round(s);
  if (total < 3600) {
    const m = Math.floor(total / 60);
    return `${m} min ${String(total % 60).padStart(2, '0')} s`;
  }
  const h = Math.floor(total / 3600);
  return `${h} h ${String(Math.floor((total % 3600) / 60)).padStart(2, '0')} min`;
}

/** A compact duration for axis ticks, where room is short: `45 s`, `4,2 min`, `1,5 h`. */
export function fmtSecondsAxis(s: number): string {
  if (!Number.isFinite(s)) return '—';
  if (s < 60) return `${fmtNumber(s, 0)} s`;
  if (s < 3600) return `${fmtNumber(s / 60, s % 60 === 0 ? 0 : 1)} min`;
  return `${fmtNumber(s / 3600, s % 3600 === 0 ? 0 : 1)} h`;
}

/** The smallest 1/2/5 × 10ⁿ at or above `v` (1 for non-positive values). */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Evenly spaced tick values from 0 to `max`, `count` intervals. */
export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max * i) / count);
}

/** Maps a value of [d0, d1] to [r0, r1]; a degenerate domain maps to r0. */
export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  return (v) => (span === 0 ? r0 : r0 + ((v - d0) / span) * (r1 - r0));
}

let counter = 0;
/** A unique id for SVG patterns, so two charts on a page never share one. */
export function uid(prefix: string): string {
  return `${prefix}-${++counter}`;
}
