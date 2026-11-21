import { Lang, activeLang } from '../core/language';

/** A date and time as the person reads them in their language («19 nov 2026, 13:36» / «Nov 19, 2026, 1:36 PM»). A date that cannot be read is shown as it came. */
export function formatDateTime(iso: string, lang: Lang = activeLang()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** A size in bytes as a person reads it: gigabytes from a billion, else megabytes («14.2 GB», «400.0 MB»). */
export function formatBytes(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;
}
