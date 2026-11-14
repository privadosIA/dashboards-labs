import { Pipe, PipeTransform } from '@angular/core';

/**
 * Shortens a long name in the middle, keeping its start and its end (where the
 * extension and the variant live): `models/krea2_turbo-Q4_K_M.gguf` →
 * `models/krea2_t…Q4_K_M.gguf`. Short values pass through untouched. The full
 * value must stay reachable (tooltip, aria-label) wherever this is used.
 */
@Pipe({ name: 'middleEllipsis' })
export class MiddleEllipsisPipe implements PipeTransform {
  transform(value: string | null | undefined, max = 32, tail = 14): string {
    if (!value) return '';
    if (value.length <= max) return value;
    const t = Math.min(tail, Math.floor((max - 1) / 2));
    return `${value.slice(0, max - 1 - t)}…${value.slice(value.length - t)}`;
  }
}
