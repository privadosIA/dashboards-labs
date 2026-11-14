import { InjectionToken } from '@angular/core';

/** Gives the person a file. The browser's own is the default; a test gives its own and sees what would have been downloaded. */
export type Download = (filename: string, text: string, mime: string) => void;

export function browserDownload(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const DOWNLOAD = new InjectionToken<Download>('DOWNLOAD', { providedIn: 'root', factory: () => browserDownload });

/** The pause between two downloads started together: browsers refuse a second one that follows the first at once. */
export const BETWEEN_DOWNLOADS_MS = 250;
