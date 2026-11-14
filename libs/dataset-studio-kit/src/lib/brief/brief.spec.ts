import { TestBed } from '@angular/core/testing';
import { provideLabForms } from '@lab/forms-kit';

import { DATASET_STUDIO_OPTIONS } from '../core/options';
import type { EngineCard } from '../engines/model';
import { type GenerationMode, kindOf } from '../kinds/kinds';
import { LOOKS } from '../looks/looks';
import { Brief } from './brief';

const models: EngineCard[] = [
  { id: 'sd15', name: 'Stable Diffusion 1.5', state: 'ready', source: 'none' },
  { id: 'jug', name: 'Juggernaut XL', description: 'Fotorrealista', state: 'ready', source: 'none' },
  { id: 'toon', name: 'Toon', description: 'illustration, anime', state: 'ready', source: 'none' },
];

async function create(kind: 'video' | 'images' | 'graphics' | 'songs' | 'piece', mode: GenerationMode, lang: 'es' | 'en' = 'en') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: DATASET_STUDIO_OPTIONS, useValue: { lang } }, provideLabForms({ lang })] });
  const fixture = TestBed.createComponent(Brief);
  fixture.componentRef.setInput('kind', kindOf(kind));
  fixture.componentRef.setInput('mode', mode);
  fixture.componentRef.setInput('models', models);
  const recommended: string[] = [];
  fixture.componentInstance.recommend.subscribe((id) => recommended.push(id));
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, brief: fixture.componentInstance, recommended };
}
async function settle(fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('Brief', () => {
  it('counts the brief against the kind\'s limit and says why Generate is off when it is over', async () => {
    const { fixture, el, brief } = await create('video', 'sentence');
    brief.brief.set('x'.repeat(2100));
    await settle(fixture);
    expect(q(el, 'brief-counter')!.textContent).toContain('2100 / 2000');
    expect(q(el, 'brief-over')!.textContent).toContain('2000');
    brief.brief.set('x'.repeat(2000));
    await settle(fixture);
    expect(q(el, 'brief-over')).toBeNull();
  });

  it('says the mode in use and why, and in one line per scene how many scenes and calls that is', async () => {
    const { fixture, el, brief } = await create('video', 'lines');
    expect(q(el, 'brief-mode')!.textContent).toContain('One line per scene');
    brief.brief.set('one\n\ntwo\nstyle: soft\n- three');
    await settle(fixture);
    expect(q(el, 'brief-calls')!.textContent).toContain('3 scenes → 3 assistant calls');
    const sentence = await create('video', 'sentence');
    expect(q(sentence.el, 'brief-mode')!.textContent).toContain('One sentence');
    expect(q(sentence.el, 'brief-calls')).toBeNull();
  });

  it('shows the negative and the look for video and images only', async () => {
    const video = await create('video', 'lines');
    expect(video.el.querySelectorAll('textarea').length).toBe(2);
    expect(video.el.querySelector('mat-select, select')).not.toBeNull();
    const songs = await create('songs', 'track');
    expect(songs.el.querySelectorAll('textarea').length).toBe(1);
    expect(songs.el.querySelector('mat-select, select')).toBeNull();
  });

  it('adds the look\'s words at the end of the brief, visibly, and recommends the installed model that suits it', async () => {
    const { fixture, el, brief, recommended } = await create('images', 'lines');
    brief.brief.set('a neon street');
    await settle(fixture);
    // the person's pick goes through the form
    (brief as unknown as { form: { set: (v: Record<string, unknown>) => void } }).form.set({ brief: 'a neon street', negative: '', look: 'illustration' });
    await settle(fixture);
    expect(brief.brief()).toBe(`a neon street\nstyle: ${LOOKS[1].words}`);
    expect(recommended).toEqual(['toon']);
    expect(q(el, 'look-recommended')!.textContent).toContain('Toon');
  });

  it('says so when no installed model suits the look, and recommends nothing', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: DATASET_STUDIO_OPTIONS, useValue: { lang: 'en' } }, provideLabForms({ lang: 'en' })] });
    const fixture = TestBed.createComponent(Brief);
    fixture.componentRef.setInput('kind', kindOf('images'));
    fixture.componentRef.setInput('mode', 'lines');
    fixture.componentRef.setInput('models', [models[0]]);
    const got: string[] = [];
    fixture.componentInstance.recommend.subscribe((id) => got.push(id));
    await settle(fixture);
    (fixture.componentInstance as unknown as { form: { set: (v: Record<string, unknown>) => void } }).form.set({ brief: 'x', negative: '', look: 'realistic' });
    await settle(fixture);
    expect(got).toEqual([]);
    expect(q(fixture.nativeElement as HTMLElement, 'look-none')).not.toBeNull();
  });

  it('puts the look back to none when the brief loses its style line, whoever changes it', async () => {
    const { fixture, brief } = await create('images', 'lines');
    (brief as unknown as { form: { set: (v: Record<string, unknown>) => void } }).form.set({ brief: 'x', negative: '', look: 'realistic' });
    await settle(fixture);
    expect(brief.look()).toBe('realistic');
    // the person deletes the line in the text
    (brief as unknown as { form: { set: (v: Record<string, unknown>) => void } }).form.set({ brief: 'x', negative: '', look: 'realistic' });
    brief.brief.set('x');
    await settle(fixture);
    expect(brief.look()).toBe('');
    // a preset is inserted from outside, with a style line of the kit's
    brief.brief.set(`a\nstyle: ${LOOKS[0].words}`);
    await settle(fixture);
    expect(brief.look()).toBe('realistic');
  });

  it('keeps the negative the person writes', async () => {
    const { fixture, brief } = await create('video', 'sentence');
    (brief as unknown as { form: { set: (v: Record<string, unknown>) => void } }).form.set({ brief: 'x', negative: 'blurry, text', look: '' });
    await settle(fixture);
    expect(brief.negative()).toBe('blurry, text');
  });

  it('recommends once the models arrive when the look was picked before them', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: DATASET_STUDIO_OPTIONS, useValue: { lang: 'en' } }, provideLabForms({ lang: 'en' })] });
    const fixture = TestBed.createComponent(Brief);
    fixture.componentRef.setInput('kind', kindOf('images'));
    fixture.componentRef.setInput('mode', 'lines');
    fixture.componentRef.setInput('models', []);
    const got: string[] = [];
    fixture.componentInstance.recommend.subscribe((id) => got.push(id));
    await settle(fixture);
    (fixture.componentInstance as unknown as { form: { set: (v: Record<string, unknown>) => void } }).form.set({ brief: 'x', negative: '', look: 'illustration' });
    await settle(fixture);
    expect(got).toEqual([]);
    fixture.componentRef.setInput('models', models);
    await settle(fixture);
    expect(got).toEqual(['toon']);
    expect(q(fixture.nativeElement as HTMLElement, 'look-recommended')!.textContent).toContain('Toon');
  });
});
