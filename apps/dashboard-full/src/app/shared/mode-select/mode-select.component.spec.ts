import { TestBed } from '@angular/core/testing';

import { ModeFilterStore } from '../../core/mode-filter.store';
import { ModeSelectComponent } from './mode-select.component';

describe('ModeSelectComponent', () => {
  async function create() {
    await TestBed.configureTestingModule({ imports: [ModeSelectComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ModeSelectComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the chosen modes, video by default', async () => {
    const f = await create();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('mat-select')).toBeTruthy();
    expect(el.textContent).toContain('Vídeo');
    expect(el.textContent).not.toContain('Música');
  });

  it('is the shared preference: choosing in the store is seen, and choosing here is stored', async () => {
    const f = await create();
    const store = TestBed.inject(ModeFilterStore);
    store.set(['video', 'music']);
    f.detectChanges();
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Vídeo, Música');
    (f.componentInstance as unknown as { change(m: string[]): void }).change(['images']);
    expect([...store.modes()]).toEqual(['images']);
  });

  it('says so when no mode is chosen', async () => {
    const f = await create();
    TestBed.inject(ModeFilterStore).set([]);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Ninguno');
  });

  it('also chooses where the projects were made, both by default', async () => {
    const f = await create();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="origin-select"]')).toBeTruthy();
    expect(el.textContent).toContain('Escritorio, Móvil');
    (f.componentInstance as unknown as { changeOrigins(o: string[]): void }).changeOrigins(['mobile']);
    f.detectChanges();
    await f.whenStable();
    expect([...TestBed.inject(ModeFilterStore).origins()]).toEqual(['mobile']);
    expect(el.textContent).not.toContain('Escritorio');
  });

  it('can leave the modes out for a screen that has only one (the song library)', async () => {
    await TestBed.configureTestingModule({ imports: [ModeSelectComponent] }).compileComponents();
    const f = TestBed.createComponent(ModeSelectComponent);
    f.componentRef.setInput('modes', false);
    await f.whenStable();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="mode-select"]')).toBeNull();
    expect(el.querySelector('[data-testid="origin-select"]')).toBeTruthy();
  });
});
