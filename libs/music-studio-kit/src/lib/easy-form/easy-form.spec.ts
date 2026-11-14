import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../../testing/memory-storage';
import { SongDraftStore } from '../song/draft.store';
import { InMemorySongs, type InMemoryOptions } from '../song/in-memory.adapter';
import { SONGS } from '../song/tokens';
import { EasyForm } from './easy-form';

async function draw(options: InMemoryOptions = {}): Promise<{ fixture: ComponentFixture<EasyForm>; store: SongDraftStore }> {
  stubStorage();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang: 'en' }), { provide: SONGS, useValue: new InMemorySongs({ pace: 10, ...options }) }] });
  const fixture = TestBed.createComponent(EasyForm);
  const store = TestBed.inject(SongDraftStore);
  await settle(fixture);
  return { fixture, store };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

const q = <T extends HTMLElement>(fixture: ComponentFixture<unknown>, sel: string) => (fixture.nativeElement as HTMLElement).querySelector<T>(sel);
const click = async (fixture: ComponentFixture<unknown>, sel: string) => {
  q<HTMLElement>(fixture, sel)!.click();
  await settle(fixture);
};

async function type(fixture: ComponentFixture<unknown>, sel: string, value: string): Promise<void> {
  const field = q<HTMLTextAreaElement>(fixture, sel)!;
  field.value = value;
  field.dispatchEvent(new Event('input'));
  await settle(fixture);
}

describe('EasyForm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws the prompt with its counter, the instrumental switch, the vocal gender and three quick examples', async () => {
    const { fixture } = await draw();
    expect(q(fixture, 'textarea[data-testid=prompt]')).toBeTruthy();
    expect(q(fixture, '[data-testid=prompt-count]')!.textContent?.trim()).toBe('0/2000');
    expect(q(fixture, '[data-testid=instrumental]')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Vocal Gender');
    expect(fixture.nativeElement.querySelectorAll('.example')).toHaveLength(3);
  });

  it('puts what is typed in the draft and counts it', async () => {
    const { fixture, store } = await draw();
    await type(fixture, '[data-testid=prompt]', 'A soothing piano melody');
    expect(store.prompt()).toBe('A soothing piano melody');
    expect(q(fixture, '[data-testid=prompt-count]')!.textContent?.trim()).toBe('23/2000');
  });

  it('fills the prompt from a quick example', async () => {
    const { fixture, store } = await draw();
    await click(fixture, '[data-testid=example-0]');
    expect(store.prompt()).toBe('Tropical house with steel drums and summer beach vibes');
    expect(q<HTMLTextAreaElement>(fixture, '[data-testid=prompt]')!.value).toBe('Tropical house with steel drums and summer beach vibes');
    expect(store.easyProblems()).toEqual([]);
  });

  it('turns the instrumental switch into the draft', async () => {
    const { fixture, store } = await draw();
    const toggle = q<HTMLButtonElement>(fixture, '[data-testid=instrumental]')!;
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    toggle.click();
    await settle(fixture);
    expect(store.instrumental()).toBe(true);
    expect(q(fixture, '[data-testid=instrumental]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the vocal gender for every generator and hides the instrumental switch for DiffRhythm2', async () => {
    const { fixture, store } = await draw();
    store.setGenerator('ace-step');
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Vocal Gender');
    expect(q(fixture, '[data-testid=instrumental]')).toBeTruthy();
    store.setGenerator('diffrhythm2');
    await settle(fixture);
    expect(q(fixture, '[data-testid=instrumental]')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Vocal Gender');
  });
});
