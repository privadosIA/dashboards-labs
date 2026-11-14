import { Pipe, PipeTransform } from '@angular/core';

import { activeLang } from '../../core/language';

/** Bytes → human size ("512 B", "3.4 MB" in English, "3,4 MB" in Spanish). */
@Pipe({ name: 'moBytes' })
export class BytesPipe implements PipeTransform {
  transform(bytes: number | null | undefined): string {
    if (bytes == null || !isFinite(bytes) || bytes < 0) {
      return '—';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = '';
    for (const u of units) {
      value /= 1024;
      unit = u;
      if (value < 1024) break;
    }
    const rounded = value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace('.', activeLang() === 'es' ? ',' : '.');
    return `${rounded} ${unit}`;
  }
}
