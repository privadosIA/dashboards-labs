import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MODEL_LIBRARY_OPTIONS } from '../../core/options';
import type { ModelPack } from '../../port';
import { PackCard } from './pack-card';

const installing = (progress: ModelPack['progress']): ModelPack => ({
  id: 'kenney-food-kit',
  name: 'Kenney Food Kit',
  author: 'Kenney',
  licence: 'CC0',
  attribution: false,
  source: 'catalog',
  tags: [],
  size_bytes: 4_606_270,
  state: 'installing',
  progress,
  models: 0,
});

describe('PackCard', () => {
  let fixture: ComponentFixture<PackCard>;
  const q = (id: string) => (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function open(pack: ModelPack): void {
    TestBed.configureTestingModule({ providers: [{ provide: MODEL_LIBRARY_OPTIONS, useValue: { lang: 'en' } }] });
    fixture = TestBed.createComponent(PackCard);
    fixture.componentRef.setInput('pack', pack);
    fixture.detectChanges();
  }

  it('says how many bytes of the zip are in while the server knows the size', () => {
    open(installing({ done: 1_048_576, total: 4_194_304 }));
    expect(q('pack-progress')?.textContent).toContain('of');
    expect(q('pack-progress')?.querySelector('mat-progress-bar')?.getAttribute('mode')).toBe('determinate');
  });

  it('shows no numbers and an open-ended bar while the server has not measured the download yet (total 0)', () => {
    open(installing({ done: 0, total: 0 }));
    const bar = q('pack-progress')?.querySelector('mat-progress-bar');
    expect(bar?.getAttribute('mode')).toBe('indeterminate');
    expect(q('pack-progress')?.textContent).not.toContain(' of ');
  });
});
