import { Injectable, InjectionToken, inject } from '@angular/core';

/** What the notifier needs of the browser, so that a test can give it something else. */
export interface NotifyEnv {
  /** The browser's `Notification`, when it has one. */
  readonly notification?: {
    readonly permission: NotificationPermission;
    requestPermission(): Promise<NotificationPermission>;
    new (title: string, options?: NotificationOptions): unknown;
  };
  /** Whether the page is hidden (another tab, or the window minimised). */
  hidden(): boolean;
}

export const NOTIFY_ENV = new InjectionToken<NotifyEnv>('NOTIFY_ENV', {
  providedIn: 'root',
  factory: () => ({ notification: typeof Notification === 'undefined' ? undefined : Notification, hidden: () => document.hidden }),
});

/**
 * Tells the person a piece finished when they are not looking at the page. It asks for the browser's permission only
 * when it is asked to (pressing Draw is the person's own action), and tells only when the permission was given.
 */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly env = inject(NOTIFY_ENV);

  /** Asks for the permission once: when the browser has not been asked yet. A refusal is not an error. */
  async allow(): Promise<void> {
    const n = this.env.notification;
    if (!n || n.permission !== 'default') return;
    try {
      await n.requestPermission();
    } catch {
      // a browser that will not ask: the page itself still says when the piece is done
    }
  }

  /** A notification, when the permission is given and the page is hidden. Whether it was shown. */
  finished(title: string, body: string): boolean {
    const n = this.env.notification;
    if (!n || n.permission !== 'granted' || !this.env.hidden()) return false;
    try {
      new n(title, { body });
      return true;
    } catch {
      return false;
    }
  }
}
