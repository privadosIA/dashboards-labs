import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideServerConnection } from '@lab/server-connection';

import { stubStorage } from '../../../testing/memory-storage';
import { InMemorySongs } from '../../song/in-memory.adapter';
import { SONGS } from '../../song/tokens';
import { EnginesButton } from './engines-button';

describe('EnginesButton', () => {
  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
  });

  it('opens the panel of the music engines once, however many times it is pressed', () => {
    stubStorage();
    TestBed.configureTestingModule({ providers: [provideServerConnection({ lang: 'en' }), { provide: SONGS, useValue: new InMemorySongs() }] });
    const fixture = TestBed.createComponent(EnginesButton);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid=engines-open]')!;
    expect(button.textContent).toContain('Engines');
    button.click();
    button.click();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(1);
  });
});
