import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';

import { CONNECTION_STORES } from './connection.service';
import { ConnectionButton } from './connection-button/connection-button';
import { ConnectionDialogService } from './connection-dialog.service';
import { SERVER_CONNECTION_LANG } from './provide-server-connection';

function setup(saved: { server: string; token: string } | null = null) {
  const store = { getItem: () => (saved ? JSON.stringify(saved) : null), setItem: () => undefined, removeItem: () => undefined };
  TestBed.configureTestingModule({ providers: [{ provide: CONNECTION_STORES, useValue: { persistent: store, session: null } }, { provide: SERVER_CONNECTION_LANG, useValue: 'en' }] });
  return { service: TestBed.inject(ConnectionDialogService), dialog: TestBed.inject(MatDialog) };
}

describe('ConnectionDialogService', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('opens the connection box, one at a time', () => {
    const { service, dialog } = setup();
    service.open();
    service.open();
    service.unauthorized();
    expect(dialog.openDialogs).toHaveLength(1);
  });

  it('opens again after it was closed', async () => {
    const { service, dialog } = setup();
    service.unauthorized();
    dialog.closeAll();
    await vi.waitFor(() => expect(dialog.openDialogs).toHaveLength(0));
    service.open();
    expect(dialog.openDialogs).toHaveLength(1);
  });
});

describe('ConnectionButton', () => {
  afterEach(() => TestBed.inject(MatDialog).closeAll());

  it('shows the server in use, or "this server", and opens the box when pressed', () => {
    const own = setup();
    let fixture = TestBed.createComponent(ConnectionButton);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Connection');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('this server');
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(own.dialog.openDialogs).toHaveLength(1);

    TestBed.inject(MatDialog).closeAll();
    TestBed.resetTestingModule();
    setup({ server: 'http://host:4666', token: '' });
    fixture = TestBed.createComponent(ConnectionButton);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('http://host:4666');
  });
});
