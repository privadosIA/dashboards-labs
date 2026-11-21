import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DiffRhythm2Settings } from '../../core/api.models';
import { ApiService } from '../../core/api.service';
import { fakeEngines } from '../../core/engines.fake';
import { EnginesStore } from '../../core/engines.store';
import { DiffRhythm2CardComponent } from './diffrhythm2-card.component';

const BASE: DiffRhythm2Settings = { saved: '', token_set: false, remote: false, consented: false, source: 'default' };

describe('DiffRhythm2CardComponent', () => {
  let fixture: ComponentFixture<DiffRhythm2CardComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const chip = () => el().querySelector('[data-testid="diffrhythm2-source"] .chip')!.textContent!.trim();
  const show = async (settings: DiffRhythm2Settings) => {
    fixture.componentRef.setInput('diffrhythm2', settings);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DiffRhythm2CardComponent],
      providers: [{ provide: ApiService, useValue: { listInstalls: () => of({ installs: [] }) } }, { provide: EnginesStore, useValue: fakeEngines() }],
    }).compileComponents();
    fixture = TestBed.createComponent(DiffRhythm2CardComponent);
  });

  it('says a default while no address is saved', async () => {
    await show(BASE);
    expect(chip()).toBe('por defecto');
  });

  it('says an address that comes from the environment', async () => {
    await show({ ...BASE, saved: 'http://music.lan:8787', source: 'env' });
    expect(chip()).toBe('del entorno');
  });

  it('follows the settings when a save answers a new source, without reloading the page', async () => {
    await show(BASE);
    await show({ ...BASE, saved: 'http://music.lan:8787', source: 'setting' });
    expect(chip()).toBe('guardado aquí');
  });

  it('has the block of how it runs only when the settings carry the backend', async () => {
    await show(BASE);
    expect(el().querySelector('app-music-backend')).not.toBeNull();
    expect(el().querySelector('[data-testid="diffrhythm2-backend"]')).toBeNull(); // an older server: the block draws nothing
    await show({ ...BASE, backend: 'docker', backend_source: 'setting' });
    expect(el().querySelector('[data-testid="diffrhythm2-backend"]')).not.toBeNull();
  });
});
