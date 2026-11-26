import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';

import { CONNECTION_STORES } from './connection.service';
import { ConnectionDialogService } from './connection-dialog.service';
import { DialogDrag } from './dialog-drag';
import { SERVER_CONNECTION_LANG } from './provide-server-connection';

describe('DialogDrag', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('makes the title of every dialog that opens the handle to move it', async () => {
    const store = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    TestBed.configureTestingModule({ providers: [{ provide: CONNECTION_STORES, useValue: { persistent: store, session: null } }, { provide: SERVER_CONNECTION_LANG, useValue: 'en' }] });
    TestBed.inject(DialogDrag).start();
    TestBed.inject(ConnectionDialogService).open();
    await vi.waitFor(() => expect(document.querySelector('.cdk-overlay-pane h2')).toBeTruthy());
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>('.cdk-overlay-pane h2')!.style.cursor).toBe('move'));
  });
});
