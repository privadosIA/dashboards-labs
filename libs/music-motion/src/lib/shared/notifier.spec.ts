import { TestBed } from '@angular/core/testing';

import { NOTIFY_ENV, Notifier, type NotifyEnv } from './notifier';

function setup(permission: NotificationPermission | null, hidden: boolean) {
  const shown: [string, NotificationOptions | undefined][] = [];
  const request = vi.fn().mockResolvedValue('granted');
  class FakeNotification {
    static permission = permission as NotificationPermission;
    static requestPermission = request;
    constructor(title: string, options?: NotificationOptions) {
      shown.push([title, options]);
    }
  }
  const env: NotifyEnv = { notification: permission === null ? undefined : (FakeNotification as unknown as NotifyEnv['notification']), hidden: () => hidden };
  TestBed.configureTestingModule({ providers: [{ provide: NOTIFY_ENV, useValue: env }] });
  return { notifier: TestBed.inject(Notifier), shown, request };
}

describe('Notifier', () => {
  it('tells the person a piece finished when the permission is given and the page is hidden', () => {
    const { notifier, shown } = setup('granted', true);
    expect(notifier.finished('Quiet Town', 'Done')).toBe(true);
    expect(shown).toEqual([['Quiet Town', { body: 'Done' }]]);
  });

  it('does not tell a person who is looking at the page', () => {
    const { notifier, shown } = setup('granted', false);
    expect(notifier.finished('a', 'b')).toBe(false);
    expect(shown).toEqual([]);
  });

  it('does not tell without the permission, or when the browser has no notifications', () => {
    for (const permission of ['default', 'denied', null] as const) {
      TestBed.resetTestingModule();
      const { notifier, shown } = setup(permission, true);
      expect(notifier.finished('a', 'b')).toBe(false);
      expect(shown).toEqual([]);
    }
  });

  it('asks for the permission only when the browser has not been asked yet', async () => {
    const fresh = setup('default', true);
    await fresh.notifier.allow();
    expect(fresh.request).toHaveBeenCalledTimes(1);
    for (const permission of ['granted', 'denied', null] as const) {
      TestBed.resetTestingModule();
      const other = setup(permission, true);
      await other.notifier.allow();
      expect(other.request).not.toHaveBeenCalled();
    }
  });

  it('does not fail when the browser will not ask or will not show', async () => {
    const throwing = setup('default', true);
    throwing.request.mockRejectedValue(new Error('blocked'));
    await expect(throwing.notifier.allow()).resolves.toBeUndefined();
  });
});
