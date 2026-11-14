/** Seconds as `m:ss` (`1:05`); a negative or missing figure is `0:00`. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A length of time to wait, in words a person reads: `45 s`, `3 min`, `1 h 05 min`. */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Bytes as MB with one decimal (`8.4 MB`), or as GB from 1000 MB. */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1_000_000;
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}
