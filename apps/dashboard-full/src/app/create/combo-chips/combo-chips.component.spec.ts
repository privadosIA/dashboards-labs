import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MusicTagCombo } from '../../core/api.models';
import { ComboChipsComponent } from './combo-chips.component';

const COMBOS: MusicTagCombo[] = [
  { id: 'chill-lofi', name: 'Chill Lo-fi', tags: ['lo-fi', 'chill', 'piano', 'slow'] },
  { id: 'hiphop-beat', name: 'Hip-Hop Beat', tags: ['hip-hop', '808', 'bass', 'rap'] },
];

describe('ComboChipsComponent', () => {
  let fixture: ComponentFixture<ComboChipsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ComboChipsComponent] }).compileComponents();
    fixture = TestBed.createComponent(ComboChipsComponent);
  });

  it('shows nothing until the combinations are known', () => {
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.combos')).toBeNull();
  });

  it('offers each combination and says which one was tapped', () => {
    const got: MusicTagCombo[] = [];
    fixture.componentInstance.picked.subscribe((c) => got.push(c));
    fixture.componentRef.setInput('combos', COMBOS);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.combo').length).toBe(2);
    (el.querySelector('[data-testid=combo-hiphop-beat]') as HTMLButtonElement).click();
    expect(got).toEqual([COMBOS[1]]);
    expect((el.querySelector('[data-testid=combo-chill-lofi]') as HTMLElement).title).toBe('lo-fi, chill, piano, slow');
  });
});
