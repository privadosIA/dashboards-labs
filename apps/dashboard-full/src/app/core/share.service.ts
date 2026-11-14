import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Shares a result as a file with the share sheet of the device (WhatsApp, Telegram, ...). Where the browser cannot share
 * files (no HTTPS, or a desktop browser) the file is downloaded instead, so the button always does something useful.
 */
@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly http = inject(HttpClient);
  /** The address being fetched to share, for a progress indication; null when idle. */
  readonly busy = signal<string | null>(null);

  /** Whether the browser can hand a file to the share sheet (the button says «Compartir» or «Descargar» by this). */
  canShareFiles(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function';
  }

  /** Saves the file at `url` to the device. */
  download(url: string, name?: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = name ?? fileNameOf(url);
    a.click();
  }

  /** Shares the file at `url`; downloads it when sharing files is not possible. A cancelled sheet is not an error. */
  async share(url: string, name?: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(url);
    try {
      const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
      const file = new File([blob], name ?? fileNameOf(url), { type: blob.type });
      if (this.canShareFiles() && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (err) {
          if ((err as DOMException).name !== 'AbortError') throw err;
        }
        return;
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } finally {
      this.busy.set(null);
    }
  }
}

/** The last segment of an address, without its query. */
export function fileNameOf(url: string): string {
  return decodeURIComponent(url.split('?')[0].split('/').pop() || 'archivo');
}
