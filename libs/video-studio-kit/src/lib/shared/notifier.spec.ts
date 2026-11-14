import { Notifier } from './notifier';

type Fake = { permission: NotificationPermission; requestPermission: ReturnType<typeof vi.fn>; shown: { title: string; body?: string; onclick?: () => void; close: () => void }[] };

function fakeNotification(permission: NotificationPermission): Fake {
  const fake: Fake = { permission, requestPermission: vi.fn(async () => 'granted'), shown: [] };
  class N {
    static permission = permission;
    static requestPermission = fake.requestPermission;
    onclick?: () => void;
    close = vi.fn();
    constructor(public title: string, options?: NotificationOptions) {
      fake.shown.push(Object.assign(this, { body: options?.body }));
    }
  }
  vi.stubGlobal('Notification', N);
  return fake;
}

describe('the notifier', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a notification when granted, and runs the click handler and closes it', () => {
    const fake = fakeNotification('granted');
    const clicked = vi.fn();
    new Notifier().show('Ready', 'a cat', clicked);
    expect(fake.shown).toHaveLength(1);
    expect(fake.shown[0]).toMatchObject({ title: 'Ready', body: 'a cat' });
    fake.shown[0].onclick?.();
    expect(clicked).toHaveBeenCalled();
    expect(fake.shown[0].close).toHaveBeenCalled();
  });

  it('shows nothing when the permission is denied or undecided', () => {
    for (const permission of ['denied', 'default'] as const) {
      const fake = fakeNotification(permission);
      new Notifier().show('Ready', 'a cat', () => undefined);
      expect(fake.shown).toEqual([]);
    }
  });

  it('asks only when the permission is undecided', async () => {
    const undecided = fakeNotification('default');
    await new Notifier().request();
    expect(undecided.requestPermission).toHaveBeenCalledTimes(1);
    for (const permission of ['granted', 'denied'] as const) {
      const fake = fakeNotification(permission);
      await new Notifier().request();
      expect(fake.requestPermission).not.toHaveBeenCalled();
    }
  });

  it('does nothing and does not fail in a browser without notifications', async () => {
    vi.stubGlobal('Notification', undefined);
    const notifier = new Notifier();
    expect(notifier.supported).toBe(false);
    expect(notifier.permission).toBe('unsupported');
    await notifier.request();
    expect(() => notifier.show('a', 'b', () => undefined)).not.toThrow();
  });

  it('survives a browser that throws', async () => {
    vi.stubGlobal('Notification', class { static permission = 'granted'; constructor() { throw new Error('illegal'); } });
    expect(() => new Notifier().show('a', 'b', () => undefined)).not.toThrow();
    vi.stubGlobal('Notification', class { static permission = 'default'; static requestPermission = () => Promise.reject(new Error('no')); });
    await expect(new Notifier().request()).resolves.toBeUndefined();
  });
});
