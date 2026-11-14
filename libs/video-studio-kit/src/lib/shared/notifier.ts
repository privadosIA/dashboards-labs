import { Injectable } from '@angular/core';

/**
 * The browser's notifications behind one small door, so the page can use them and a spec can replace them. It never
 * throws: an unsupported browser, a refused permission or a failing call all end in nothing happening.
 */
@Injectable({ providedIn: 'root' })
export class Notifier {
  get supported(): boolean {
    return typeof Notification !== 'undefined';
  }

  get permission(): NotificationPermission | 'unsupported' {
    return this.supported ? Notification.permission : 'unsupported';
  }

  /** Asks for the permission when it is undecided. Call it from a user gesture; it is never waited for. */
  async request(): Promise<void> {
    if (this.permission !== 'default') return;
    try {
      await Notification.requestPermission();
    } catch {
      // A browser that refuses to ask: the notice in the page is enough.
    }
  }

  /** Shows a notification when the permission is granted; `onClick` runs when it is activated. */
  show(title: string, body: string, onClick: () => void): void {
    if (this.permission !== 'granted') return;
    try {
      const notification = new Notification(title, { body });
      notification.onclick = () => {
        onClick();
        notification.close();
      };
    } catch {
      // Some browsers only allow them from a service worker: nothing to do.
    }
  }
}
