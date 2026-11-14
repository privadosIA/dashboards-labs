import { Pipe, PipeTransform } from '@angular/core';

import { activeLang } from '../../core/language';

/**
 * Milliseconds → compact clock time: "0:03", "4:12", "1:02:07". Used for
 * phase durations and run elapsed time (always rendered in mono). With
 * `fine`, anything under 10 s keeps its tenths ("0.3 s"), so a run that only
 * rejoined cached scenes does not read as "0:00".
 */
@Pipe({ name: 'moDuration' })
export class DurationPipe implements PipeTransform {
  transform(ms: number | null | undefined, fine = false): string {
    if (ms == null || !isFinite(ms) || ms < 0) {
      return '—';
    }
    if (fine && ms < 10_000) {
      const tenths = (ms / 1000).toFixed(1);
      return `${activeLang() === 'es' ? tenths.replace('.', ',') : tenths} s`;
    }
    const totalSeconds = Math.round(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const two = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  }
}
