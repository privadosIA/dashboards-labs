import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { CONNECTION_STORES, ConnectionService } from '../connection.service';
import { SERVER_CONNECTION_LANG } from '../provide-server-connection';
import { CONNECTION_RELOAD, ConnectionDialog } from './connection-dialog';

function setup(saved: { server: string; token: string } | null = null, lang: 'es' | 'en' = 'en') {
  const data = new Map<string, string>();
  if (saved) data.set('lab.connection', JSON.stringify(saved));
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  const close = vi.fn();
  const reload = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: CONNECTION_STORES, useValue: { persistent: store, session: null } },
      { provide: SERVER_CONNECTION_LANG, useValue: lang },
      { provide: MatDialogRef, useValue: { close } },
      { provide: CONNECTION_RELOAD, useValue: reload },
    ],
  });
  const fixture = TestBed.createComponent(ConnectionDialog);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(selector: string) => el.querySelector(selector) as T;
  const type = async (name: 'server' | 'token', value: string) => {
    const input = q<HTMLInputElement>(`input[name=${name}]`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const test = async () => {
    q<HTMLButtonElement>('button.test').click();
    fixture.detectChanges();
    await vi.waitFor(() => expect(q('.probe').getAttribute('data-probe')).not.toBe('testing'));
    fixture.detectChanges();
  };
  return { fixture, el, q, type, test, close, reload, connection: TestBed.inject(ConnectionService) };
}

describe('ConnectionDialog', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens with the current server and token, the token hidden, and the texts of the language', () => {
    const { q, el } = setup({ server: 'http://host:4666', token: 'abc' });
    expect(q<HTMLInputElement>('input[name=server]').value).toBe('http://host:4666');
    expect(q<HTMLInputElement>('input[name=token]').type).toBe('password');
    expect(q<HTMLInputElement>('input[name=token]').value).toBe('abc');
    expect(q<HTMLInputElement>('input[name=remember]').checked).toBe(true);
    expect(el.querySelector('h2')?.textContent).toBe('Server connection');
    expect(el.textContent).toContain('Empty = the server that serves this page.');
  });

  it('is in Spanish when the dashboard is', () => {
    const { el } = setup(null, 'es');
    expect(el.querySelector('h2')?.textContent).toBe('Conexión con el servidor');
  });

  describe('Test connection', () => {
    it('calls the typed server with the typed token, saves nothing, and says it works', async () => {
      const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
      vi.stubGlobal('fetch', fetch);
      const { type, test, q, connection } = setup();
      await type('server', ' http://host:4666/api/ ');
      await type('token', 'abc');
      await test();
      expect(fetch).toHaveBeenCalledWith('http://host:4666/api/environment', expect.objectContaining({ headers: { Authorization: 'Bearer abc' }, signal: expect.any(AbortSignal) }));
      expect(q('.probe').textContent?.trim()).toBe('The connection works.');
      expect(connection.server()).toBe('');
    });

    it('sends no header without a token and tests the page\'s own server when the address is empty', async () => {
      const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
      vi.stubGlobal('fetch', fetch);
      const { test } = setup();
      await test();
      expect(fetch).toHaveBeenCalledWith('/api/environment', expect.objectContaining({ headers: {} }));
    });

    it('says the token is missing or wrong on a 401', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
      const { test, q } = setup();
      await test();
      expect(q('.probe').getAttribute('data-probe')).toBe('unauthorized');
      expect(q('.probe').textContent).toContain('token is missing or wrong');
    });

    it('says it cannot connect, naming --cors-origin, when nothing answers or the answer is not usable', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
      const down = setup();
      await down.test();
      expect(down.q('.probe').getAttribute('data-probe')).toBe('unreachable');
      expect(down.q('.probe').textContent).toContain('--cors-origin');

      TestBed.resetTestingModule();
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
      const broken = setup();
      await broken.test();
      expect(broken.q('.probe').getAttribute('data-probe')).toBe('unreachable');
    });

    it('forgets the result when something is typed', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
      const { test, type, q } = setup();
      await test();
      await type('token', 'x');
      expect(q('.probe').getAttribute('data-probe')).toBe('idle');
    });
  });

  describe('Save connection', () => {
    it('keeps the settings, closes and reloads the page when the server or the token changed', async () => {
      const { type, q, close, reload, connection } = setup();
      await type('server', 'http://host:4666');
      await type('token', 'abc');
      q<HTMLButtonElement>('button.save').click();
      expect(connection.server()).toBe('http://host:4666');
      expect(connection.token()).toBe('abc');
      expect(close).toHaveBeenCalledWith(true);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not reload when nothing changed', () => {
      const { q, close, reload } = setup({ server: 'http://host:4666', token: 'abc' });
      q<HTMLButtonElement>('button.save').click();
      expect(close).toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    it('remembers or not as ticked', () => {
      const { q, connection } = setup();
      q<HTMLInputElement>('input[name=remember]').click();
      q<HTMLButtonElement>('button.save').click();
      expect(connection.remember()).toBe(false);
    });
  });

  it('Cancel closes without keeping anything or reloading', async () => {
    const { type, q, close, reload, connection } = setup();
    await type('server', 'http://elsewhere');
    q<HTMLButtonElement>('button.cancel').click();
    expect(close).toHaveBeenCalledWith();
    expect(connection.server()).toBe('');
    expect(reload).not.toHaveBeenCalled();
  });
});
